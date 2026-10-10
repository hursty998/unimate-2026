import { spawnSync } from "node:child_process";
import process from "node:process";
import { URL } from "node:url";
import { validateLocalResetUrls } from "../packages/database/connection-safety.mjs";

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

const databaseUrl = process.env["DATABASE_URL"];
const directUrl = process.env["DIRECT_URL"];
if (!databaseUrl || !directUrl) {
  fail(
    "DATABASE_URL and DIRECT_URL are required. Configure packages/database/.env before running pnpm auth:test.",
  );
  process.exit(1);
}

try {
  validateLocalResetUrls(databaseUrl, directUrl);
} catch {
  fail("Auth integration is restricted to the local PostgreSQL endpoint.");
  process.exit(1);
}

const status = spawnSync("supabase", ["status", "-o", "json"], {
  encoding: "utf8",
});

if (status.status !== 0 || status.error) {
  fail(
    "Local Supabase is unavailable. Run pnpm db:start before pnpm auth:test.",
  );
  process.exit(1);
}

let local;
try {
  local = JSON.parse(status.stdout);
} catch {
  fail("Could not read local Supabase status for the Auth test harness.");
  process.exit(1);
}

let apiUrl;
try {
  apiUrl = new URL(local.API_URL);
} catch {
  fail("Local Supabase did not report a valid API URL.");
  process.exit(1);
}

if (!["localhost", "127.0.0.1", "::1"].includes(apiUrl.hostname)) {
  fail("Auth integration is restricted to a loopback Supabase stack.");
  process.exit(1);
}

if (
  typeof local.PUBLISHABLE_KEY !== "string" ||
  !local.PUBLISHABLE_KEY.startsWith("sb_publishable_") ||
  typeof local.SECRET_KEY !== "string" ||
  !local.SECRET_KEY.startsWith("sb_secret_")
) {
  fail(
    "The local Auth test requires current sb_publishable_ and sb_secret_ keys.",
  );
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    "--test-concurrency=1",
    "--test",
    "apps/api/.test-dist/modules/auth/auth.identity.integration.test.js",
    "apps/api/.test-dist/modules/auth/auth.supabase.integration.test.js",
  ],
  {
    env: {
      ...process.env,
      SUPABASE_URL: apiUrl.origin,
      SUPABASE_SECRET_KEY: local.SECRET_KEY,
      SUPABASE_STORAGE_BUCKET: "foundation-storage-proof",
      SUPABASE_TEST_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
      SUPABASE_TEST_SECRET_KEY: local.SECRET_KEY,
    },
    stdio: "inherit",
  },
);

if (result.error) {
  fail("Could not start the local Auth integration tests.");
} else if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
