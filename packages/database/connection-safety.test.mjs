import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateDirectUrl,
  validateLocalResetUrls,
} from "./connection-safety.mjs";

test("DIRECT_URL accepts a PostgreSQL URL selecting exactly app", () => {
  const directUrl =
    "postgresql://postgres:postgres@localhost:55322/postgres?schema=app";

  assert.equal(validateDirectUrl(directUrl), directUrl);
});

test("DIRECT_URL rejects a missing schema", () => {
  assert.throws(
    () => validateDirectUrl("postgresql://localhost/postgres"),
    /DIRECT_URL must include exactly one schema=app/,
  );
});

test("DIRECT_URL rejects a schema other than app", () => {
  assert.throws(
    () => validateDirectUrl("postgresql://localhost/postgres?schema=public"),
    /DIRECT_URL must include exactly one schema=app/,
  );
});

test("DIRECT_URL rejects duplicate schema parameters", () => {
  assert.throws(
    () =>
      validateDirectUrl(
        "postgresql://localhost/postgres?schema=app&schema=public",
      ),
    /DIRECT_URL must include exactly one schema=app/,
  );
});

test("DIRECT_URL rejects malformed and non-PostgreSQL URLs", () => {
  assert.throws(
    () => validateDirectUrl(undefined),
    /DIRECT_URL is required and must be a PostgreSQL URL/,
  );
  assert.throws(
    () => validateDirectUrl("not a URL"),
    /DIRECT_URL must be a valid PostgreSQL URL/,
  );
  assert.throws(
    () => validateDirectUrl("https://localhost/postgres?schema=app"),
    /DIRECT_URL must use the PostgreSQL protocol/,
  );
});

test("local reset accepts identical runtime and direct targets", () => {
  assert.doesNotThrow(() =>
    validateLocalResetUrls(
      "postgresql://postgres:runtime@127.0.0.1/postgres",
      "postgresql://postgres:migration@127.0.0.1:5432/postgres?schema=app",
    ),
  );
});

test("local reset accepts matching loopback IPv6 targets", () => {
  assert.doesNotThrow(() =>
    validateLocalResetUrls(
      "postgresql://postgres@[::1]/postgres",
      "postgresql://postgres@[::1]:5432/postgres?schema=app",
    ),
  );
});

test("local reset rejects different local ports", () => {
  assert.throws(
    () =>
      validateLocalResetUrls(
        "postgresql://postgres@localhost:55322/postgres",
        "postgresql://postgres@localhost:55323/postgres?schema=app",
      ),
    /must target the same local PostgreSQL hostname, port, and database/,
  );
});

test("local reset compares PostgreSQL host and port query overrides", () => {
  assert.throws(
    () =>
      validateLocalResetUrls(
        "postgresql://postgres@localhost:55322/postgres?host=example.invalid",
        "postgresql://postgres@localhost:55322/postgres?schema=app&host=example.invalid",
      ),
    /DATABASE_URL must target a loopback PostgreSQL host/,
  );

  assert.throws(
    () =>
      validateLocalResetUrls(
        "postgresql://postgres@localhost/postgres?port=55322",
        "postgresql://postgres@localhost/postgres?schema=app&port=55323",
      ),
    /must target the same local PostgreSQL hostname, port, and database/,
  );
});

test("local reset rejects ambiguous host and service overrides", () => {
  assert.throws(
    () =>
      validateLocalResetUrls(
        "postgresql://postgres@localhost/postgres?host=localhost&host=127.0.0.1",
        "postgresql://postgres@localhost/postgres?schema=app",
      ),
    /must not contain multiple host values/,
  );

  assert.throws(
    () =>
      validateLocalResetUrls(
        "postgresql://postgres@localhost/postgres?service=remote",
        "postgresql://postgres@localhost/postgres?schema=app",
      ),
    /must not use hostaddr or PostgreSQL service overrides/,
  );
});

test("local reset rejects different loopback hostname aliases", () => {
  assert.throws(
    () =>
      validateLocalResetUrls(
        "postgresql://postgres@localhost:55322/postgres",
        "postgresql://postgres@127.0.0.1:55322/postgres?schema=app",
      ),
    /must target the same local PostgreSQL hostname, port, and database/,
  );
});

test("local reset rejects different database names", () => {
  assert.throws(
    () =>
      validateLocalResetUrls(
        "postgresql://postgres@localhost:55322/runtime",
        "postgresql://postgres@localhost:55322/migrations?schema=app",
      ),
    /must target the same local PostgreSQL hostname, port, and database/,
  );
});

test("local reset rejects non-loopback endpoints and missing app schema", () => {
  assert.throws(
    () =>
      validateLocalResetUrls(
        "postgresql://postgres@localhost:55322/postgres",
        "postgresql://postgres@example.invalid:55322/postgres?schema=app",
      ),
    /DIRECT_URL must target a loopback PostgreSQL host/,
  );
  assert.throws(
    () =>
      validateLocalResetUrls(
        "postgresql://postgres@localhost:55322/postgres",
        "postgresql://postgres@localhost:55322/postgres",
      ),
    /DIRECT_URL must include exactly one schema=app/,
  );
});
