import assert from "node:assert/strict";
import { trace } from "@opentelemetry/api";
import {
  type JobQueue,
  type JsonValue,
  type QueueMessageId,
} from "@unimate/queue";
import type { TelemetryProvider } from "@unimate/observability";
import type { WorkerConfig } from "./config.js";
import {
  dispatchOutboxBatch,
  type OutboxDispatcherDatabase,
  type OutboxDispatcherTransaction,
} from "./outbox-dispatcher.js";
import { logWorkerCycleFailure, runWorkerCycle } from "./runtime.js";
import { createJobHandlerRegistry } from "./registry.js";
import { createTestObservability } from "./test-support/observability.js";
import { test } from "node:test";
import { z } from "zod";

test("does not log dispatch completion before transaction commit", async () => {
  const message = {
    id: "0199f4ad-6789-7abc-8def-0123456789ab",
    eventType: "foundation.task.complete",
    payloadVersion: 1,
    payload: { taskId: "0199f4ad-6789-7abc-8def-1123456789ab" },
    correlationId: "0199f4ad-6789-7abc-8def-2123456789ab",
    traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    tracestate: "vendor=value",
    createdAt: new Date("2026-10-09T00:00:00.000Z"),
    publishedAt: null,
  };
  const commitError = new Error("synthetic transaction commit failure");
  const originContext = {
    traceparent: message.traceparent,
    tracestate: message.tracestate,
  };
  const dispatchContext = {
    traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-3f3e59cd86ba7942-01",
    tracestate: message.tracestate,
  };
  let pendingPublishedAt: Date | undefined;
  const committedPublishedAt: Date | null = null;
  let acceptedQueuePayload: JsonValue | undefined;
  let callbackReturned = false;
  const extractedContexts: string[] = [];
  const transaction: OutboxDispatcherTransaction = {
    async $queryRaw<T>() {
      return [{ id: message.id }] as T;
    },
    outboxMessage: {
      async findUniqueOrThrow() {
        return message;
      },
      async update({ data }) {
        pendingPublishedAt = data.publishedAt;
      },
    },
  };
  const database: OutboxDispatcherDatabase = {
    async $transaction(operation) {
      await operation(transaction);
      callbackReturned = true;
      throw commitError;
    },
  };
  const queue: JobQueue = {
    async enqueue(payload) {
      acceptedQueuePayload = payload;
      return "queue-message-7" as QueueMessageId;
    },
    async receive() {
      return [];
    },
    async acknowledge() {
      return true;
    },
    async deadLetter() {
      return true;
    },
  };
  const observability = createTestObservability();
  const telemetry: TelemetryProvider = {
    async runInSpan({ name, attributes, operation }) {
      const span = trace
        .getTracer("outbox-commit-failure-test")
        .startSpan(name, attributes === undefined ? {} : { attributes });
      try {
        return await operation(span);
      } finally {
        span.end();
      }
    },
    runWithActiveSpan(_span, operation) {
      return operation();
    },
    capturePropagationContext() {
      return dispatchContext;
    },
    async runWithPropagationContext(context, operation) {
      if (context) {
        extractedContexts.push(context.traceparent);
      }
      return operation();
    },
  };

  const config: WorkerConfig = {
    databaseUrl: "unused",
    queueDatabaseUrl: "unused",
    queueName: "outbox-commit-test",
    visibilityTimeoutSeconds: 30,
    batchSize: 1,
    maxDeliveryAttempts: 5,
    pollIntervalMilliseconds: 10,
    foundationPushReceiptCheckDelaySeconds: 900,
    observability: {
      environment: "test",
      logLevel: "silent",
      traceExporter: "none",
      slowQueryThresholdMilliseconds: 250,
    },
  };
  const cycle = await runWorkerCycle({
    dispatchOutbox: (limit) =>
      dispatchOutboxBatch({
        database,
        queue,
        telemetry,
        executionContext: observability.executionContext,
        logger: observability.logger,
        limit,
      }),
    queue,
    telemetry,
    executionContext: observability.executionContext,
    logger: observability.logger,
    errorReporter: observability.errorReporter,
    registry: createJobHandlerRegistry([]),
    config,
  });
  for (const failure of cycle.failures) {
    logWorkerCycleFailure(failure, observability.logger);
  }

  assert.equal(callbackReturned, true);
  assert.equal(cycle.failures.length, 1);
  assert.equal(cycle.failures[0]?.cause, commitError);
  assert.equal(acceptedQueuePayload !== undefined, true);
  assert.equal(pendingPublishedAt instanceof Date, true);
  assert.equal(committedPublishedAt, null);
  assert.deepEqual(extractedContexts, [
    originContext.traceparent,
    dispatchContext.traceparent,
  ]);
  const envelope = z
    .object({
      observability: z.object({
        correlationId: z.string(),
        traceparent: z.string(),
      }),
    })
    .parse(acceptedQueuePayload);
  const metadata = envelope.observability;
  assert.equal(metadata?.["correlationId"], message.correlationId);
  assert.equal(metadata?.["traceparent"], dispatchContext.traceparent);

  const completedEvents = observability.logs.filter(
    (log) => log.event === "outbox.dispatch.completed",
  );
  const failedEvents = observability.logs.filter(
    (log) => log.event === "outbox.dispatch.failed",
  );
  assert.equal(completedEvents.length, 0);
  assert.equal(failedEvents.length, 1);
  assert.equal(
    failedEvents[0]?.fields?.["correlation_id"],
    message.correlationId,
  );
  assert.equal(failedEvents[0]?.fields?.["job_id"], message.id);
  assert.equal(
    failedEvents[0]?.fields?.["queue_message_id"],
    "queue-message-7",
  );
  assert.equal(
    JSON.stringify(observability.logs).includes(commitError.message),
    false,
  );
});
