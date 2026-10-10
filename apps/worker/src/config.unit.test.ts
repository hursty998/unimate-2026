import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWorkerConfig, WorkerConfigurationError } from "./config.js";

const validEnvironment = {
  DATABASE_URL: "postgresql://worker:local@127.0.0.1:55322/postgres",
  QUEUE_DATABASE_URL: "postgresql://worker:local@127.0.0.1:55322/postgres",
};

test("parses explicit PostgreSQL connections and safe worker defaults", () => {
  assert.deepEqual(parseWorkerConfig(validEnvironment), {
    databaseUrl: validEnvironment.DATABASE_URL,
    queueDatabaseUrl: validEnvironment.QUEUE_DATABASE_URL,
    queueName: "unimate_foundation_jobs",
    visibilityTimeoutSeconds: 30,
    batchSize: 10,
    maxDeliveryAttempts: 5,
    pollIntervalMilliseconds: 1_000,
    foundationPushReceiptCheckDelaySeconds: 900,
    observability: {
      environment: "development",
      logLevel: "info",
      traceExporter: "none",
      slowQueryThresholdMilliseconds: 250,
    },
  });
});

test("rejects unsafe values without echoing connection credentials", () => {
  assert.throws(
    () =>
      parseWorkerConfig({
        ...validEnvironment,
        DATABASE_URL: "https://secret.invalid/credential",
        QUEUE_NAME: "Bad Queue Name",
        QUEUE_VISIBILITY_TIMEOUT_SECONDS: "0",
        WORKER_BATCH_SIZE: "101",
        WORKER_MAX_DELIVERY_ATTEMPTS: "-1",
        WORKER_POLL_INTERVAL_MS: "1",
        FOUNDATION_PUSH_RECEIPT_CHECK_DELAY_SECONDS: "-1",
      }),
    (error: unknown) => {
      assert.ok(error instanceof WorkerConfigurationError);
      assert.deepEqual(error.invalidFields, [
        "DATABASE_URL",
        "QUEUE_NAME",
        "QUEUE_VISIBILITY_TIMEOUT_SECONDS",
        "WORKER_BATCH_SIZE",
        "WORKER_MAX_DELIVERY_ATTEMPTS",
        "WORKER_POLL_INTERVAL_MS",
        "FOUNDATION_PUSH_RECEIPT_CHECK_DELAY_SECONDS",
      ]);
      assert.equal(error.message.includes("secret.invalid"), false);
      return true;
    },
  );
});

test("allows zero-delay receipt checks for deterministic local transport proof", () => {
  assert.equal(
    parseWorkerConfig({
      ...validEnvironment,
      FOUNDATION_PUSH_RECEIPT_CHECK_DELAY_SECONDS: "0",
    }).foundationPushReceiptCheckDelaySeconds,
    0,
  );
});

test("requires both the application and queue PostgreSQL URLs", () => {
  assert.throws(
    () => parseWorkerConfig({ DATABASE_URL: validEnvironment.DATABASE_URL }),
    (error: unknown) =>
      error instanceof WorkerConfigurationError &&
      error.invalidFields.includes("QUEUE_DATABASE_URL"),
  );
});

test("rejects PostgreSQL URLs that override their parsed host or port", () => {
  assert.throws(
    () =>
      parseWorkerConfig({
        ...validEnvironment,
        QUEUE_DATABASE_URL: `${validEnvironment.QUEUE_DATABASE_URL}?host=127.0.0.1`,
      }),
    (error: unknown) =>
      error instanceof WorkerConfigurationError &&
      error.invalidFields.includes("QUEUE_DATABASE_URL"),
  );
});
