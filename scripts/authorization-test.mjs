import { spawnSync } from "node:child_process";
import process from "node:process";
import { validateLocalResetUrls } from "../packages/database/connection-safety.mjs";

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

const databaseUrl = process.env["DATABASE_URL"];
const directUrl = process.env["DIRECT_URL"];
if (!databaseUrl || !directUrl) {
  fail(
    "DATABASE_URL and DIRECT_URL are required. Configure packages/database/.env before running pnpm authorization:test.",
  );
  process.exit(1);
}

try {
  validateLocalResetUrls(databaseUrl, directUrl);
} catch {
  fail(
    "Authorization integration is restricted to the local PostgreSQL endpoint.",
  );
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    "--test-concurrency=1",
    "--test",
    "apps/api/dist/modules/authorization/authorization.integration.test.js",
  ],
  { stdio: "inherit" },
);

if (result.error) {
  fail("Could not start the local authorization integration tests.");
} else if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
