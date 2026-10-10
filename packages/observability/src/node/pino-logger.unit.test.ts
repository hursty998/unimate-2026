import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { test } from "node:test";
import { AsyncExecutionContext } from "./execution-context.js";
import { StructuredErrorReporter } from "./error-reporter.js";
import { PinoStructuredLogger } from "./pino-logger.js";

function createLogger() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  const executionContext = new AsyncExecutionContext();
  const logger = new PinoStructuredLogger(executionContext, {
    service: "unimate-test",
    environment: "test",
    level: "info",
    destination,
  });

  return { executionContext, lines, logger };
}

test("emits predictable structured fields and redacts UniMate secrets", async () => {
  const { executionContext, lines, logger } = createLogger();
  const databaseUrl = new URL(
    [
      "postgresql:",
      "//",
      "synthetic-user:",
      "synthetic-password",
      "@db.example/app",
    ].join(""),
  );
  const unsafeValues = [
    "Bearer synthetic-authorization-secret",
    "ExponentPushToken[synthetic-push-token]",
    "https://storage.example/file?token=synthetic-signed-capability",
    databaseUrl.toString(),
    "sb_secret_synthetic-local-key",
    "synthetic private request body",
    "synthetic job payload",
  ];

  executionContext.run(
    {
      requestId: "request-1",
      correlationId: "correlation-1",
      jobId: "job-1",
      queueMessageId: "queue-1",
      deliveryCount: 2,
    },
    () => {
      logger.info("redaction.test", {
        method: "POST",
        authorization: unsafeValues[0],
        headers: { authorization: unsafeValues[0] },
        pushToken: unsafeValues[1],
        signedUrl: unsafeValues[2],
        databaseUrl: unsafeValues[3],
        supabaseSecretKey: unsafeValues[4],
        body: unsafeValues[5],
        payload: unsafeValues[6],
      });
    },
  );
  await logger.flush();

  assert.equal(lines.length, 1);
  const serialized = lines[0] ?? "";
  const entry = JSON.parse(serialized) as Record<string, unknown>;
  assert.equal(entry["service"], "unimate-test");
  assert.equal(entry["environment"], "test");
  assert.match(String(entry["timestamp"]), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(entry["event"], "redaction.test");
  assert.equal(entry["level"], "info");
  assert.equal(entry["request_id"], "request-1");
  assert.equal(entry["correlation_id"], "correlation-1");
  assert.equal(entry["job_id"], "job-1");
  assert.equal(entry["queue_message_id"], "queue-1");
  assert.equal(entry["delivery_count"], 2);

  for (const unsafeValue of unsafeValues) {
    assert.equal(serialized.includes(unsafeValue), false);
  }
  assert.equal(serialized.includes("[REDACTED]"), true);
  assert.equal(serialized.includes("synthetic private request body"), false);
  assert.equal(serialized.includes("synthetic job payload"), false);
});

test("error reporting omits exception messages and arbitrary context", async () => {
  const { lines, logger } = createLogger();
  const reporter = new StructuredErrorReporter(logger);

  reporter.captureException(new Error("synthetic-token-value"), {
    operation: "api.request",
    correlationId: "correlation-2",
  });
  await logger.flush();

  const serialized = lines[0] ?? "";
  const entry = JSON.parse(serialized) as Record<string, unknown>;
  assert.equal(entry["event"], "error.exception.captured");
  assert.equal(entry["error_type"], "Error");
  assert.equal(entry["operation"], "api.request");
  assert.equal(entry["correlation_id"], "correlation-2");
  assert.equal(serialized.includes("synthetic-token-value"), false);
  assert.equal(serialized.includes("stack"), false);
});
