import assert from "node:assert/strict";
import { test } from "node:test";
import { findCredentialFindings } from "./secret-scan.mjs";

test("documentation and the Supabase key prefix alone are not credentials", () => {
  assert.deepEqual(
    findCredentialFindings(
      "docs/engineering/PROVIDERS.md",
      "Use an sb_secret_ key only on the server; never put a service-role key in Expo.",
    ),
    [],
  );
});

test("detects credential-shaped values without returning their contents", () => {
  const secret = `sb_secret_${"a".repeat(32)}`;
  const assignment = ["SUPABASE_SECRET_KEY=", '"', secret, '"'].join("");
  const findings = findCredentialFindings("apps/api/.env", assignment);

  assert.deepEqual(
    findings.map(({ line, category }) => ({ line, category })),
    [{ line: 1, category: "Supabase secret key" }],
  );
  assert.equal(JSON.stringify(findings).includes(secret), false);
});

test("detects literal server secret assignments but ignores placeholders", () => {
  const sensitiveAssignment = [
    "SUPABASE_SECRET_KEY=",
    '"',
    "static-credential-value",
    '"',
  ].join("");
  const findings = findCredentialFindings(
    "apps/api/.env",
    `${sensitiveAssignment}\nSUPABASE_DB_PASSWORD=replace-this-value`,
  );

  assert.deepEqual(findings, [
    { line: 1, category: "server secret assignment" },
  ]);
});

test("detects the exact current local Supabase key even if its shape is unusual", () => {
  const currentKey = `sb_secret_${"local".repeat(2)}`;

  assert.deepEqual(
    findCredentialFindings(
      "apps/api/src/config.ts",
      `const key = "${currentKey}";`,
      currentKey,
    ),
    [{ line: 1, category: "current local Supabase key" }],
  );
});

test("detects high-confidence token, private-key, and credential URL patterns", () => {
  const findings = findCredentialFindings(
    "scripts/config.txt",
    [
      `const cloudKey = "AKIA${"A".repeat(16)}";`,
      ["-----BEGIN ", "PRIVATE KEY-----"].join(""),
      [
        "postgresql://",
        "appuser:",
        "long-development-password",
        "@localhost/app",
      ].join(""),
    ].join("\n"),
  );

  assert.deepEqual(
    findings.map(({ line, category }) => ({ line, category })),
    [
      { line: 1, category: "AWS access key" },
      { line: 2, category: "private key material" },
      { line: 3, category: "credential-bearing connection URL" },
    ],
  );
});

test("rejects server-only configuration under mobile but allows public client keys", () => {
  assert.deepEqual(
    findCredentialFindings(
      "apps/mobile/.env",
      "DATABASE_URL=postgresql://localhost/app\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_public",
    ).map(({ line, category }) => ({ line, category })),
    [
      {
        line: 1,
        category: "server-only configuration under apps/mobile",
      },
    ],
  );
});
