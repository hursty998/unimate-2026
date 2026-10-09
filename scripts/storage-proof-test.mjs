import { spawnSync } from "node:child_process";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";
import { validateLocalResetUrls } from "../packages/database/connection-safety.mjs";

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function isLoopback(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(
    hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1"),
  );
}

function databaseTarget(value) {
  const url = new URL(value);
  return {
    host: url.searchParams.get("host") ?? url.hostname,
    port: url.searchParams.get("port") ?? (url.port || "5432"),
    database: url.pathname,
  };
}

const databaseUrl = process.env["DATABASE_URL"];
const directUrl = process.env["DIRECT_URL"];
if (!databaseUrl || !directUrl) {
  fail(
    "Storage-proof integration requires local DATABASE_URL and DIRECT_URL from packages/database/.env.",
  );
}

try {
  validateLocalResetUrls(databaseUrl, directUrl);
} catch {
  fail("Storage-proof integration is restricted to local PostgreSQL.");
}

const status = spawnSync("supabase", ["status", "-o", "json"], {
  encoding: "utf8",
  timeout: 30_000,
});
if (status.status !== 0 || status.error) {
  fail(
    "Local Supabase is unavailable. Start the local stack before the storage-proof integration.",
  );
}

let local;
try {
  local = JSON.parse(status.stdout);
} catch {
  fail("Could not read local Supabase status for the storage-proof test.");
}

let apiUrl;
let localDatabaseUrl;
try {
  apiUrl = new URL(local.API_URL);
  localDatabaseUrl = new URL(local.DB_URL);
} catch {
  fail("Local Supabase did not report valid API and database URLs.");
}

if (
  apiUrl.protocol !== "http:" ||
  apiUrl.port !== "55321" ||
  !isLoopback(apiUrl.hostname) ||
  !["postgres:", "postgresql:"].includes(localDatabaseUrl.protocol) ||
  !isLoopback(localDatabaseUrl.hostname)
) {
  fail("Storage-proof integration only runs against the local loopback stack.");
}

try {
  const configuredTarget = databaseTarget(databaseUrl);
  const localTarget = databaseTarget(local.DB_URL);
  if (
    configuredTarget.host !== localTarget.host ||
    configuredTarget.port !== localTarget.port ||
    configuredTarget.database !== localTarget.database
  ) {
    fail(
      "Configured PostgreSQL and local Supabase status identify different databases.",
    );
  }
} catch {
  fail("Could not validate the local PostgreSQL target.");
}

if (
  typeof local.PUBLISHABLE_KEY !== "string" ||
  !local.PUBLISHABLE_KEY.startsWith("sb_publishable_") ||
  typeof local.SECRET_KEY !== "string" ||
  !local.SECRET_KEY.startsWith("sb_secret_")
) {
  fail(
    "Local Storage proof requires current publishable and secret Supabase keys.",
  );
}

const storageHeaders = {
  apikey: local.SECRET_KEY,
  Authorization: `Bearer ${local.SECRET_KEY}`,
  "content-type": "application/json",
};
const bucketListResponse = await globalThis.fetch(
  new URL("/storage/v1/bucket", apiUrl),
  {
    headers: storageHeaders,
  },
);
if (!bucketListResponse.ok) {
  fail(
    `Could not inspect local Storage buckets (HTTP ${bucketListResponse.status}).`,
  );
}

const buckets = await bucketListResponse.json();
if (!Array.isArray(buckets)) {
  fail("Local Storage returned an invalid bucket list.");
}

let proofBucket = buckets.find(
  (bucket) => bucket.id === "foundation-storage-proof",
);
if (!proofBucket) {
  const createResponse = await globalThis.fetch(
    new URL("/storage/v1/bucket", apiUrl),
    {
      method: "POST",
      headers: storageHeaders,
      body: JSON.stringify({
        id: "foundation-storage-proof",
        name: "foundation-storage-proof",
        public: false,
        file_size_limit: 1_048_576,
        allowed_mime_types: ["text/plain"],
      }),
    },
  );
  if (!createResponse.ok) {
    fail(
      `Could not provision the local private proof bucket (HTTP ${createResponse.status}).`,
    );
  }

  const verifyResponse = await globalThis.fetch(
    new URL("/storage/v1/bucket", apiUrl),
    {
      headers: storageHeaders,
    },
  );
  if (!verifyResponse.ok) {
    fail(
      `Could not verify the local proof bucket (HTTP ${verifyResponse.status}).`,
    );
  }
  const verifiedBuckets = await verifyResponse.json();
  if (!Array.isArray(verifiedBuckets)) {
    fail("Local Storage returned an invalid bucket list after provisioning.");
  }
  proofBucket = verifiedBuckets.find(
    (bucket) => bucket.id === "foundation-storage-proof",
  );
}

if (!proofBucket) {
  fail("The local foundation-storage-proof bucket was not provisioned.");
}

if (
  proofBucket.public !== false ||
  proofBucket.file_size_limit !== 1_048_576 ||
  !Array.isArray(proofBucket.allowed_mime_types) ||
  proofBucket.allowed_mime_types.length !== 1 ||
  proofBucket.allowed_mime_types[0] !== "text/plain"
) {
  fail(
    "The local proof bucket must be private, limited to 1 MiB, and allow text/plain only.",
  );
}

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const result = spawnSync(
  process.execPath,
  [
    "--test-concurrency=1",
    "--test",
    "apps/api/dist/modules/storage-proof/storage-proof.integration.test.js",
  ],
  {
    cwd: repositoryRoot,
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
  fail("Could not start the local storage-proof integration.");
}

if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
