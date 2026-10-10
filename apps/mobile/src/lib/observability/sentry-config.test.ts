import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getConfiguredSentryDsn,
  redactSentryExceptionText,
} from "./sentry-config.ts";

test("mobile error reporting is disabled when no DSN is configured", () => {
  assert.equal(getConfiguredSentryDsn(undefined), undefined);
  assert.equal(getConfiguredSentryDsn("  "), undefined);
});

test("validates a configured Sentry DSN without printing it", () => {
  assert.equal(
    getConfiguredSentryDsn("https://public-key@sentry.example/42"),
    "https://public-key@sentry.example/42",
  );
  assert.throws(() => getConfiguredSentryDsn("not-a-dsn"), {
    message: "EXPO_PUBLIC_SENTRY_DSN must be a valid Sentry DSN URL.",
  });
  assert.throws(
    () =>
      getConfiguredSentryDsn(
        "https://public-key@sentry.example/42?auth-token=synthetic-secret",
      ),
    { message: "EXPO_PUBLIC_SENTRY_DSN must be a valid Sentry DSN URL." },
  );
});

test("redacts bearer, push, signed URL, database URL, and Supabase secrets", () => {
  const databaseUrl = new URL(
    [
      "postgresql:",
      "//",
      "synthetic-user:",
      "synthetic-password",
      "@db.example/app",
    ].join(""),
  );
  const supabaseSecret = ["sb", "secret", "synthetic-supabase-secret"].join(
    "_",
  );
  const sensitiveValues = [
    "Bearer synthetic-bearer-secret",
    "ExponentPushToken[synthetic-push-secret]",
    "https://storage.example/file?token=synthetic-signed-secret",
    databaseUrl.toString(),
    supabaseSecret,
  ];
  const sanitized = redactSentryExceptionText(sensitiveValues.join(" "));

  const unredactedIndexes = sensitiveValues.flatMap((value, index) =>
    sanitized.includes(value) ? [index] : [],
  );
  assert.deepEqual(unredactedIndexes, []);
  assert.match(sanitized, /\[REDACTED/);
});
