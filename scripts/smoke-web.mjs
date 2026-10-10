import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  createDatabaseIdentityCleaner,
  createLocalSmokeFixture,
  readLocalSupabaseStatus,
  validateLocalSmokeTarget,
} from "./local-smoke-fixture.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiDirectory = resolve(repositoryRoot, "apps/api");
const playwrightConfig = resolve(repositoryRoot, "playwright.config.mjs");
const apiUrl = "http://127.0.0.1:3000";
const webUrl = "http://localhost:8082";
const apiPort = 3000;
const webPort = 8082;
const serverSecrets = [
  process.env["SUPABASE_SECRET_KEY"],
  process.env["DATABASE_URL"],
  process.env["DIRECT_URL"],
  process.env["SUPABASE_DB_PASSWORD"],
].filter(Boolean);
const ownedProcesses = new Set();
let requestedSignal;

function redact(text) {
  return serverSecrets.reduce(
    (safeText, secret) => safeText.split(secret).join("[redacted]"),
    text,
  );
}

function onSignal(signal) {
  requestedSignal ??= signal;
  for (const child of ownedProcesses) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  }
}

process.once("SIGINT", () => onSignal("SIGINT"));
process.once("SIGTERM", () => onSignal("SIGTERM"));

function throwIfInterrupted() {
  if (requestedSignal) {
    throw new Error(`Smoke run interrupted by ${requestedSignal}.`);
  }
}

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    stdio: "inherit",
  });

  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed.`);
  }
}

function isHostPortAvailable(port, host) {
  return new Promise((resolveAvailability, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        resolveAvailability(false);
      } else {
        reject(error);
      }
    });
    server.listen(port, host, () => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolveAvailability(true);
        }
      });
    });
  });
}

async function isPortAvailable(port) {
  const [ipv4Available, ipv6Available] = await Promise.all([
    isHostPortAvailable(port, "127.0.0.1"),
    isHostPortAvailable(port, "::1"),
  ]);
  return ipv4Available && ipv6Available;
}

function inspectPort(port) {
  const listeners = spawnSync(
    "lsof",
    ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
    { encoding: "utf8" },
  );
  const pids = [
    ...new Set(
      (listeners.stdout ?? "")
        .split(/\s+/)
        .map((pid) => pid.trim())
        .filter((pid) => /^\d+$/.test(pid)),
    ),
  ];

  return pids.map((pid) => {
    const cwdResult = spawnSync("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"], {
      encoding: "utf8",
    });
    const commandResult = spawnSync("ps", ["-p", pid, "-o", "command="], {
      encoding: "utf8",
    });
    return {
      pid,
      cwd:
        cwdResult.stdout
          ?.split("\n")
          .find((line) => line.startsWith("n"))
          ?.slice(1) ?? "unknown",
      command: commandResult.stdout?.trim() ?? "",
    };
  });
}

async function fetchApiHealth() {
  try {
    const response = await globalThis.fetch(`${apiUrl}/v1/system/health`, {
      signal: globalThis.AbortSignal.timeout(2_000),
    });
    return response.status;
  } catch {
    return null;
  }
}

async function waitForApi(child) {
  const deadline = Date.now() + 45_000;
  let lastStatus = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("The local API exited before becoming healthy.");
    }
    lastStatus = await fetchApiHealth();
    if (lastStatus === 200) {
      return;
    }
    await delay(250);
  }
  throw new Error(
    `The local API did not become healthy within 45 seconds (last HTTP status: ${lastStatus ?? "no response"}).`,
  );
}

function startApi(target) {
  const child = spawn(
    process.execPath,
    ["--env-file-if-exists=.env", "dist/main.js"],
    {
      cwd: apiDirectory,
      env: {
        ...process.env,
        API_HOST: "127.0.0.1",
        API_PORT: String(apiPort),
        DATABASE_URL: target.databaseUrl,
        SUPABASE_URL: target.supabaseUrl,
        SUPABASE_SECRET_KEY: target.secretKey,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  ownedProcesses.add(child);
  child.once("close", () => ownedProcesses.delete(child));
  child.once("error", () => ownedProcesses.delete(child));
  if (target.secretKey && !serverSecrets.includes(target.secretKey)) {
    serverSecrets.push(target.secretKey);
  }
  child.stdout.on("data", (chunk) =>
    process.stdout.write(redact(chunk.toString())),
  );
  child.stderr.on("data", (chunk) =>
    process.stderr.write(redact(chunk.toString())),
  );
  return child;
}

function existingApiBelongsToCheckout() {
  return inspectPort(apiPort).some(
    ({ cwd, command }) =>
      cwd === apiDirectory && command.includes("dist/main.js"),
  );
}

async function ensureApi(target) {
  if (!(await isPortAvailable(apiPort))) {
    if (existingApiBelongsToCheckout() && (await fetchApiHealth()) === 200) {
      process.stdout.write("Reusing the healthy API owned by this checkout.\n");
      return null;
    }

    const owners = inspectPort(apiPort)
      .map(({ pid, cwd }) => `PID ${pid} (${cwd})`)
      .join(", ");
    throw new Error(
      `Port ${apiPort} is occupied by an unknown or unhealthy process${owners ? `: ${owners}` : ""}. No process was stopped.`,
    );
  }

  const child = startApi(target);
  return child;
}

function stopApi(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolveStop) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }, 8_000);
    child.once("close", () => {
      clearTimeout(timeout);
      resolveStop();
    });
    child.kill("SIGTERM");
  });
}

function browserEnvironment({ target, credentialsFile, outputDirectory }) {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (
      /secret|token|password|private/i.test(key) ||
      [
        "DATABASE_URL",
        "DIRECT_URL",
        "SUPABASE_URL",
        "API_HOST",
        "API_PORT",
      ].includes(key) ||
      key.startsWith("EXPO_PUBLIC_")
    ) {
      delete environment[key];
    }
  }

  return {
    ...environment,
    UNIMATE_SMOKE_API_URL: apiUrl,
    UNIMATE_SMOKE_WEB_URL: webUrl,
    UNIMATE_SMOKE_SUPABASE_URL: target.supabaseUrl,
    UNIMATE_SMOKE_SUPABASE_PUBLISHABLE_KEY: target.publishableKey,
    UNIMATE_SMOKE_CREDENTIALS_FILE: credentialsFile,
    UNIMATE_PLAYWRIGHT_OUTPUT_DIR: outputDirectory,
  };
}

function runPlaywright(environment) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      "pnpm",
      ["exec", "playwright", "test", `--config=${playwrightConfig}`],
      { cwd: repositoryRoot, env: environment, stdio: "inherit" },
    );
    ownedProcesses.add(child);
    child.once("close", () => ownedProcesses.delete(child));
    child.once("error", () => ownedProcesses.delete(child));
    child.once("error", () =>
      rejectRun(new Error("Could not start Playwright.")),
    );
    child.once("close", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(
          new Error(`Playwright smoke failed (exit code ${code ?? 1}).`),
        );
      }
    });
  });
}

async function main() {
  let target;
  let fixture;
  let apiProcess;
  let outputDirectory;
  let smokeSucceeded = false;
  const startedAt = Date.now();
  const failures = [];

  try {
    if (!process.env["DATABASE_URL"] || !process.env["DIRECT_URL"]) {
      throw new Error(
        "Local DATABASE_URL and DIRECT_URL are required; configure packages/database/.env.",
      );
    }
    target = validateLocalSmokeTarget({
      supabaseStatus: readLocalSupabaseStatus(),
      databaseUrl: process.env["DATABASE_URL"],
      directUrl: process.env["DIRECT_URL"],
    });
    throwIfInterrupted();

    if (!(await isPortAvailable(webPort))) {
      const owners = inspectPort(webPort)
        .map(({ pid, cwd }) => `PID ${pid} (${cwd})`)
        .join(", ");
      throw new Error(
        `Port ${webPort} is occupied${owners ? `: ${owners}` : ""}. No process was stopped.`,
      );
    }

    run("pnpm", ["db:check"], "Local database and migration check");
    run(
      "pnpm",
      ["exec", "turbo", "run", "build", "--filter=@unimate/api"],
      "API build",
    );
    throwIfInterrupted();

    apiProcess = await ensureApi(target);
    if (apiProcess) {
      await waitForApi(apiProcess);
      process.stdout.write("Started the local API on 127.0.0.1:3000.\n");
    }
    const cleanupDatabaseIdentity = await createDatabaseIdentityCleaner(
      target.databaseUrl,
    );
    fixture = await createLocalSmokeFixture({
      target,
      cleanupDatabaseIdentity,
    });
    const credentialsFile = await fixture.writeCredentialsFile();
    throwIfInterrupted();
    const tempRoot = await realpath(tmpdir());
    outputDirectory = await mkdtemp(`${tempRoot}/unimate-playwright-phase13-`);

    await runPlaywright(
      browserEnvironment({ target, credentialsFile, outputDirectory }),
    );
    smokeSucceeded = true;
    process.stdout.write(
      `Browser smoke passed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.\n`,
    );
  } catch (error) {
    failures.push(
      error instanceof Error ? error : new Error("Browser smoke failed."),
    );
  } finally {
    try {
      await stopApi(apiProcess);
    } catch {
      failures.push(
        new Error("Could not stop the API process started by this smoke run."),
      );
    }

    if (fixture) {
      try {
        await fixture.cleanup();
        process.stdout.write(
          "Local synthetic Auth and UniMate identity cleaned up.\n",
        );
      } catch (error) {
        failures.push(
          error instanceof Error
            ? error
            : new Error("Local smoke fixture cleanup failed."),
        );
      }
    }

    if (outputDirectory) {
      if (smokeSucceeded && failures.length === 0) {
        try {
          await rm(outputDirectory, { recursive: true, force: true });
        } catch {
          failures.push(new Error("Could not remove successful smoke output."));
        }
      } else {
        process.stderr.write(
          `Failure artifacts retained at ${outputDirectory}\n`,
        );
      }
    }

    if (requestedSignal) {
      failures.push(new Error(`Smoke run interrupted by ${requestedSignal}.`));
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      process.stderr.write(`${redact(failure.message)}\n`);
    }
    process.exitCode = 1;
  }
}

await main();
