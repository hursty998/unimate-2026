import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";
import {
  createGitHubEnvironmentExport,
  deriveLocalCiEnvironment,
  diagnosticTail,
  formatGitHubEnvironment,
} from "./ci-supabase.mjs";

const syntheticPassword = "synthetic-db-password";
const localDatabaseUrl = new URL(
  "postgresql://postgres@127.0.0.1:55322/postgres",
);
localDatabaseUrl.password = syntheticPassword;
const expectedDirectUrl = new URL(localDatabaseUrl);
expectedDirectUrl.searchParams.set("schema", "app");
const syntheticPublishableKey = [
  "sb_publishable_",
  "synthetic-public-key",
].join("");
const syntheticSecretKey = ["sb_secret_", "synthetic-service-key"].join("");
const syntheticJwt = [
  "eyJhbGciOiJub25l",
  "eyJzdWIiOiJ0ZXN0In0",
  "signature",
].join(".");

const localStatus = {
  API_URL: "http://127.0.0.1:55321",
  DB_URL: localDatabaseUrl.toString(),
  PUBLISHABLE_KEY: syntheticPublishableKey,
  SECRET_KEY: syntheticSecretKey,
  JWT_SECRET: "synthetic-jwt-secret",
  S3_PROTOCOL_ACCESS_KEY_SECRET: "synthetic-storage-secret",
};

test("CI environment maps only validated local Supabase connection values", () => {
  assert.deepEqual(deriveLocalCiEnvironment(localStatus), {
    DATABASE_URL: localStatus.DB_URL,
    DIRECT_URL: expectedDirectUrl.toString(),
    SUPABASE_URL: "http://127.0.0.1:55321",
    SUPABASE_SECRET_KEY: localStatus.SECRET_KEY,
    SUPABASE_STORAGE_BUCKET: "foundation-storage-proof",
  });
});

test("CI environment rejects non-loopback API and PostgreSQL endpoints", () => {
  assert.throws(
    () =>
      deriveLocalCiEnvironment({
        ...localStatus,
        API_URL: "https://hosted.example.test",
      }),
    /matching loopback API and PostgreSQL endpoints/,
  );
  assert.throws(() => {
    const remoteDatabaseUrl = new URL(localDatabaseUrl);
    remoteDatabaseUrl.hostname = "db.example.test";
    deriveLocalCiEnvironment({
      ...localStatus,
      DB_URL: remoteDatabaseUrl.toString(),
    });
  }, /matching loopback API and PostgreSQL endpoints/);
});

test("CI environment rejects database URLs with remote host overrides", () => {
  assert.throws(() => {
    const overriddenDatabaseUrl = new URL(localDatabaseUrl);
    overriddenDatabaseUrl.searchParams.set("host", "db.example.test");
    deriveLocalCiEnvironment({
      ...localStatus,
      DB_URL: overriddenDatabaseUrl.toString(),
    });
  }, /matching loopback API and PostgreSQL endpoints/);
});

test("GitHub environment formatting refuses multiline values", () => {
  assert.throws(
    () => formatGitHubEnvironment({ DATABASE_URL: "postgres://local\nEVIL=1" }),
    /invalid CI environment value/,
  );
});

test("privileged values are masked before they enter the GitHub environment", () => {
  const environment = deriveLocalCiEnvironment(localStatus);
  const exportPlan = createGitHubEnvironmentExport(localStatus, environment);

  assert.ok(
    exportPlan.maskCommands.some((command) =>
      command.includes(localStatus.SECRET_KEY),
    ),
  );
  assert.ok(
    exportPlan.maskCommands.some((command) =>
      command.includes(syntheticPassword),
    ),
  );
  assert.ok(
    exportPlan.maskCommands.some((command) =>
      command.includes(environment.DIRECT_URL),
    ),
  );
  assert.match(exportPlan.environmentContent, /^SUPABASE_SECRET_KEY=/m);
});

test("Supabase diagnostics redact status credentials, URL passwords, and key forms", () => {
  const diagnostic = [
    `service_role key: ${localStatus.SECRET_KEY}`,
    `DB URL: ${localStatus.DB_URL}`,
    `JWT secret: ${localStatus.JWT_SECRET}`,
    `storage ${localStatus.S3_PROTOCOL_ACCESS_KEY_SECRET}`,
    `token ${syntheticJwt}`,
  ].join("\n");
  const safe = diagnosticTail(diagnostic, [
    localStatus.SECRET_KEY,
    localStatus.DB_URL,
    localStatus.JWT_SECRET,
    localStatus.S3_PROTOCOL_ACCESS_KEY_SECRET,
    syntheticPassword,
  ]);

  for (const secret of [
    localStatus.SECRET_KEY,
    localStatus.DB_URL,
    localStatus.JWT_SECRET,
    localStatus.S3_PROTOCOL_ACCESS_KEY_SECRET,
    "synthetic-db-password",
    syntheticJwt,
  ]) {
    assert.equal(safe.includes(secret), false);
  }
  assert.match(safe, /\[redacted\]/);
  assert.ok(safe.length <= 6_000);
});

test("diagnostic tails retain only the final bounded log lines", () => {
  const lines = Array.from({ length: 40 }, (_, index) => `line ${index}`);
  const tail = diagnosticTail(lines.join("\n"));
  assert.equal(tail.split("\n").length, 30);
  assert.match(tail, /^line 10/);
});

test("GitHub environment output contains no unrelated local Supabase status values", () => {
  const output = formatGitHubEnvironment(deriveLocalCiEnvironment(localStatus));
  assert.match(output, /^DATABASE_URL=/m);
  assert.match(output, /^DIRECT_URL=/m);
  assert.match(output, /^SUPABASE_SECRET_KEY=/m);
  assert.match(output, /^SUPABASE_STORAGE_BUCKET=foundation-storage-proof$/m);
  assert.doesNotMatch(output, /JWT_SECRET|S3_PROTOCOL_ACCESS_KEY_SECRET/);
});
