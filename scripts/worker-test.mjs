import { spawnSync } from "node:child_process";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repositoryRoot,
    env: options.env ?? process.env,
    timeout: options.timeout ?? 60_000,
    ...(options.captureOutput ? { encoding: "utf8" } : { stdio: "inherit" }),
  });
}

function localSupabaseStatus() {
  let result = run("supabase", ["status", "-o", "json"], {
    captureOutput: true,
  });

  if (result.status !== 0 || result.error) {
    const start = run("supabase", ["start"], { timeout: 180_000 });
    if (start.status !== 0 || start.error) {
      fail(
        "Could not start local Supabase. Start Docker and run pnpm db:start before retrying.",
      );
    }

    result = run("supabase", ["status", "-o", "json"], {
      captureOutput: true,
    });
  }

  if (result.status !== 0 || result.error) {
    fail("Could not read local Supabase status for worker integration.");
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    fail("Local Supabase returned invalid status for worker integration.");
  }
}

function isLoopback(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(
    hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1"),
  );
}

const local = localSupabaseStatus();
let databaseUrl;

try {
  databaseUrl = new URL(local.DB_URL);
} catch {
  fail("Local Supabase did not provide a valid database URL.");
}

if (
  !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
  !isLoopback(databaseUrl.hostname)
) {
  fail("Worker integration is restricted to local loopback PostgreSQL.");
}

const providerMigration = run("supabase", ["migration", "up", "--local"]);
if (providerMigration.status !== 0 || providerMigration.error) {
  fail(
    "Could not apply local Supabase provider migrations. No hosted project was targeted.",
  );
}

const directDatabaseUrl = new URL(local.DB_URL);
directDatabaseUrl.searchParams.set("schema", "app");
const localEnvironment = {
  ...process.env,
  DATABASE_URL: local.DB_URL,
  DIRECT_URL: directDatabaseUrl.toString(),
};
const applicationMigration = run(
  "pnpm",
  ["--filter", "@unimate/database", "migrate:deploy"],
  { env: localEnvironment },
);
if (applicationMigration.status !== 0 || applicationMigration.error) {
  fail("Could not apply Prisma migrations to local app schema.");
}

const integration = run(
  process.execPath,
  [
    "--test-concurrency=1",
    "--test",
    "apps/worker/dist/worker.integration.test.js",
  ],
  {
    env: {
      ...localEnvironment,
      QUEUE_DATABASE_URL: local.DB_URL,
      SUPABASE_TEST_DATABASE_URL: local.DB_URL,
    },
    timeout: 180_000,
  },
);

if (integration.error) {
  fail("Could not start local worker integration tests.");
}

if (integration.status !== 0) {
  process.exitCode = integration.status ?? 1;
}
