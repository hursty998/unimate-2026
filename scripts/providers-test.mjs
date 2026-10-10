import { spawnSync } from "node:child_process";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const testBucket = "phase7-provider-tests";

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function runSupabase(args, options = {}) {
  return spawnSync("supabase", args, {
    cwd: repositoryRoot,
    timeout: options.timeout ?? 30_000,
    ...(options.captureOutput ? { encoding: "utf8" } : { stdio: "ignore" }),
  });
}

function localSupabaseStatus() {
  let result = runSupabase(["status", "-o", "json"], {
    captureOutput: true,
  });

  if (result.status !== 0 || result.error) {
    const start = runSupabase(["start"], { timeout: 180_000 });
    if (start.status !== 0 || start.error) {
      fail(
        "Could not start the local Supabase stack. Start Docker and run pnpm db:start before retrying.",
      );
    }

    result = runSupabase(["status", "-o", "json"], {
      captureOutput: true,
    });
  }

  if (result.status !== 0 || result.error) {
    fail(
      "Could not read local Supabase status for provider integration tests.",
    );
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    fail(
      "Local Supabase returned invalid status for provider integration tests.",
    );
  }
}

function isLoopback(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(
    hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1"),
  );
}

const local = localSupabaseStatus();
let apiUrl;
let databaseUrl;

try {
  apiUrl = new URL(local.API_URL);
  databaseUrl = new URL(local.DB_URL);
} catch {
  fail("Local Supabase did not provide valid API and database URLs.");
}

if (
  apiUrl.protocol !== "http:" ||
  !isLoopback(apiUrl.hostname) ||
  !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
  !isLoopback(databaseUrl.hostname)
) {
  fail(
    "Provider integration tests are restricted to the local loopback stack.",
  );
}

if (
  typeof local.SECRET_KEY !== "string" ||
  !local.SECRET_KEY.startsWith("sb_secret_")
) {
  fail("Local Supabase did not provide a current server-side secret key.");
}

const migration = runSupabase(["migration", "up", "--local"]);
if (migration.status !== 0 || migration.error) {
  fail(
    "Could not apply local Supabase provider migrations. No hosted project was targeted.",
  );
}

const result = spawnSync(
  process.execPath,
  [
    "--test-concurrency=1",
    "--test",
    "packages/storage/.test-dist/supabase.integration.test.js",
    "packages/queue/.test-dist/supabase.integration.test.js",
  ],
  {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      SUPABASE_TEST_URL: apiUrl.origin,
      SUPABASE_TEST_SECRET_KEY: local.SECRET_KEY,
      SUPABASE_TEST_BUCKET: testBucket,
      SUPABASE_TEST_DATABASE_URL: local.DB_URL,
    },
    stdio: "inherit",
  },
);

if (result.error) {
  fail("Could not start local provider integration tests.");
}

if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
