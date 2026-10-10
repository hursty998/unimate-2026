import { appendFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";
import { validateLocalResetUrls } from "../packages/database/connection-safety.mjs";
import { validateLocalSmokeTarget } from "./local-smoke-fixture.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const maxStartupLogBytes = 2 * 1024 * 1024;
const maskedStatusFields = [
  "ANON_KEY",
  "DB_URL",
  "JWT_SECRET",
  "PUBLISHABLE_KEY",
  "S3_PROTOCOL_ACCESS_KEY_ID",
  "S3_PROTOCOL_ACCESS_KEY_SECRET",
  "SECRET_KEY",
  "SERVICE_ROLE_KEY",
];

function parseStatusJson(statusJson) {
  try {
    const status = JSON.parse(statusJson);
    if (!status || typeof status !== "object" || Array.isArray(status)) {
      throw new Error("not an object");
    }
    return status;
  } catch {
    throw new Error(
      "Could not read local Supabase status JSON; output was withheld because it can contain credentials.",
    );
  }
}

export function deriveLocalCiEnvironment(status) {
  let databaseUrl;
  let directUrl;

  try {
    databaseUrl = new URL(status?.DB_URL);
    directUrl = new URL(databaseUrl);
    directUrl.searchParams.set("schema", "app");
  } catch {
    throw new Error(
      "Local Supabase status did not provide a valid PostgreSQL URL.",
    );
  }

  let target;
  try {
    target = validateLocalSmokeTarget({
      supabaseStatus: status,
      databaseUrl: databaseUrl.toString(),
      directUrl: directUrl.toString(),
    });
    validateLocalResetUrls(target.databaseUrl, target.directUrl);
  } catch {
    throw new Error(
      "Local Supabase status did not identify matching loopback API and PostgreSQL endpoints.",
    );
  }

  return Object.freeze({
    DATABASE_URL: target.databaseUrl,
    DIRECT_URL: target.directUrl,
    SUPABASE_URL: target.supabaseUrl,
    SUPABASE_SECRET_KEY: target.secretKey,
    SUPABASE_STORAGE_BUCKET: "foundation-storage-proof",
  });
}

function statusSensitiveValues(status) {
  const values = [];
  for (const field of maskedStatusFields) {
    if (typeof status?.[field] === "string" && status[field].length > 0) {
      values.push(status[field]);
    }
  }

  if (typeof status?.DB_URL === "string") {
    try {
      const databaseUrl = new URL(status.DB_URL);
      if (databaseUrl.password) {
        values.push(decodeURIComponent(databaseUrl.password));
      }
    } catch {
      // A malformed status URL is rejected before values are exported.
    }
  }

  return values;
}

function safeMaskValues(status, environment) {
  const values = [
    ...statusSensitiveValues(status),
    environment.DATABASE_URL,
    environment.DIRECT_URL,
    environment.SUPABASE_SECRET_KEY,
  ].filter((value) => typeof value === "string" && value.length > 0);
  return [...new Set(values)].sort((left, right) => right.length - left.length);
}

function escapeWorkflowCommand(value) {
  return value
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

export function formatGitHubEnvironment(environment) {
  return Object.entries(environment)
    .map(([name, value]) => {
      if (
        !/^[A-Z][A-Z0-9_]*$/.test(name) ||
        typeof value !== "string" ||
        /[\r\n]/.test(value)
      ) {
        throw new Error("Refusing to export an invalid CI environment value.");
      }
      return `${name}=${value}`;
    })
    .join("\n")
    .concat("\n");
}

export function createGitHubEnvironmentExport(status, environment) {
  return {
    maskCommands: safeMaskValues(status, environment).map(
      (value) => `::add-mask::${escapeWorkflowCommand(value)}`,
    ),
    environmentContent: formatGitHubEnvironment(environment),
  };
}

export function redactDiagnostic(text, sensitiveValues = []) {
  let safeText = String(text);
  for (const value of [...new Set(sensitiveValues)].sort(
    (left, right) => right.length - left.length,
  )) {
    if (value.length >= 4) {
      safeText = safeText.split(value).join("[redacted]");
    }
  }

  return safeText
    .replace(
      /((?:secret(?:[_ -]key)?|service[_ -]role(?:[_ -]key)?|anon(?:[_ -]key)?|publishable(?:[_ -]key)?|jwt(?:[_ -]secret)?|db[_ -]url|database[_ -]url|db[_ -]password|password|access[_ -]key[_ -]secret)\s*[:=]\s*)[^\r\n,]+/gi,
      "$1[redacted]",
    )
    .replace(/(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s/]+(@)/gi, "$1[redacted]$2")
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/gi, "[redacted]")
    .replace(
      /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g,
      "[redacted]",
    );
}

export function diagnosticTail(text, sensitiveValues = []) {
  const lines = redactDiagnostic(text, sensitiveValues)
    .split(/\r?\n/)
    .slice(-30);
  let result = lines.join("\n");
  if (result.length > 6_000) {
    result = result.slice(-6_000);
    const firstLineBreak = result.indexOf("\n");
    if (firstLineBreak !== -1) {
      result = result.slice(firstLineBreak + 1);
    }
  }
  return result;
}

function runSupabase(args, timeout = 180_000) {
  return spawnSync("supabase", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: maxStartupLogBytes,
    timeout,
  });
}

function readLocalStatus() {
  const result = runSupabase(["status", "-o", "json"], 30_000);
  if (result.error || result.status !== 0) {
    throw new Error(
      "Local Supabase status is unavailable; ensure `supabase start` succeeded.",
    );
  }
  return parseStatusJson(result.stdout);
}

function startupFailure(result) {
  let status;
  try {
    status = readLocalStatus();
  } catch {
    status = {};
  }

  const tail = diagnosticTail(
    `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    statusSensitiveValues(status),
  );
  const exit = result.error?.code === "ETIMEDOUT" ? "timed out" : "failed";
  process.stderr.write(`Local Supabase startup ${exit}.\n`);
  if (tail) {
    process.stderr.write(`Redacted diagnostic tail:\n${tail}\n`);
  }
  process.exitCode = 1;
}

async function startSupabase() {
  const result = runSupabase(["start"], 300_000);
  if (result.error || result.status !== 0) {
    startupFailure(result);
    return;
  }
  process.stdout.write("Started the configured local Supabase stack.\n");
}

async function exportEnvironment() {
  const githubEnvironmentPath = process.env["GITHUB_ENV"];
  if (!githubEnvironmentPath) {
    throw new Error(
      "GITHUB_ENV is required to export CI-only environment values.",
    );
  }

  const status = readLocalStatus();
  const environment = deriveLocalCiEnvironment(status);
  const exportPlan = createGitHubEnvironmentExport(status, environment);
  for (const maskCommand of exportPlan.maskCommands) {
    process.stdout.write(`${maskCommand}\n`);
  }
  await appendFile(githubEnvironmentPath, exportPlan.environmentContent, {
    encoding: "utf8",
    mode: 0o600,
  });
  process.stdout.write(
    "Validated loopback Supabase endpoints and exported the required local CI variables.\n",
  );
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (args.length > 0 || !["start", "export-env"].includes(command)) {
    throw new Error("Usage: node scripts/ci-supabase.mjs <start|export-env>");
  }

  if (command === "start") {
    await startSupabase();
    return;
  }
  await exportEnvironment();
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Local CI Supabase setup failed."}\n`,
    );
    process.exitCode = 1;
  });
}
