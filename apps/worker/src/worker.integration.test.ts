import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createDatabaseClient } from "@unimate/database";
import {
  FOUNDATION_TASK_COMPLETION_JOB_TYPE,
  foundationTaskPayloadSchema,
  jobEnvelopeSchema,
} from "@unimate/jobs";
import {
  type JobQueue,
  type JsonValue,
  type QueueMessageId,
} from "@unimate/queue";
import { withSupabaseTestQueue } from "@unimate/queue/supabase-test-support";
import { trace } from "@opentelemetry/api";
import type { TelemetryProvider } from "@unimate/observability";
import { processQueueMessage } from "./consumer.js";
import { createFoundationTaskHandler } from "./foundation-task-handler.js";
import { dispatchOutboxBatch } from "./outbox-dispatcher.js";
import { registerJobHandler } from "./registry.js";

const databaseUrl = process.env["DATABASE_URL"];
const queueDatabaseUrl = process.env["SUPABASE_TEST_DATABASE_URL"];

if (databaseUrl === undefined || queueDatabaseUrl === undefined) {
  throw new Error(
    "Local DATABASE_URL and SUPABASE_TEST_DATABASE_URL are required for the worker integration test.",
  );
}

const foundationJobType = FOUNDATION_TASK_COMPLETION_JOB_TYPE;
const telemetry: TelemetryProvider = {
  runInSpan({ name, attributes, operation }) {
    const span = trace
      .getTracer("unimate-worker-integration-tests")
      .startSpan(name, attributes === undefined ? {} : { attributes });
    return Promise.resolve()
      .then(() => operation(span))
      .finally(() => span.end());
  },
};

function createDeferredQueue() {
  let markEnqueueStarted: () => void = () => {};
  let finishEnqueue: () => void = () => {};
  const enqueueStarted = new Promise<void>((resolve) => {
    markEnqueueStarted = resolve;
  });
  const enqueueGate = new Promise<void>((resolve) => {
    finishEnqueue = resolve;
  });
  let enqueueCount = 0;
  const queue: JobQueue = {
    async enqueue() {
      enqueueCount += 1;
      markEnqueueStarted();
      await enqueueGate;
      return "9001" as QueueMessageId;
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

  return {
    queue,
    enqueueStarted,
    finishEnqueue,
    get enqueueCount() {
      return enqueueCount;
    },
  };
}

function createFailingQueue(): JobQueue {
  return {
    async enqueue() {
      throw new Error("injected queue publish failure");
    },
    async receive() {
      return [];
    },
    async acknowledge() {
      return false;
    },
    async deadLetter() {
      return false;
    },
  };
}

function observeEnqueues(queue: JobQueue, envelopes: JsonValue[]): JobQueue {
  return {
    async enqueue(payload) {
      envelopes.push(payload);
      return queue.enqueue(payload);
    },
    receive: (options) => queue.receive(options),
    acknowledge: (messageId) => queue.acknowledge(messageId),
    deadLetter: (messageId) => queue.deadLetter(messageId),
  };
}

function spawnWorkerOnce(config: {
  readonly queueName: string;
  readonly queueDatabaseUrl: string;
}): void {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./main.js", import.meta.url)), "--once"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 30_000,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        QUEUE_DATABASE_URL: config.queueDatabaseUrl,
        QUEUE_NAME: config.queueName,
        QUEUE_VISIBILITY_TIMEOUT_SECONDS: "1",
        WORKER_BATCH_SIZE: "10",
        WORKER_MAX_DELIVERY_ATTEMPTS: "5",
        WORKER_POLL_INTERVAL_MS: "10",
      },
    },
  );

  assert.equal(result.error, undefined, result.stderr);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Worker cycle complete:/);
}

test("proves atomic outbox dispatch, concurrency, local consumption, and at-least-once recovery", async () => {
  const database = createDatabaseClient({ connectionString: databaseUrl });
  const foundationTaskIds: string[] = [];
  const outboxIds: string[] = [];
  let connected = false;

  try {
    await database.$connect();
    connected = true;

    let rolledBackTaskId: string | undefined;
    let rolledBackOutboxId: string | undefined;
    await assert.rejects(
      database.$transaction(async (transaction) => {
        const task = await transaction.foundationAsyncTask.create({
          data: {},
        });
        rolledBackTaskId = task.id;
        const outbox = await transaction.outboxMessage.create({
          data: {
            eventType: foundationJobType,
            payloadVersion: 1,
            payload: { taskId: task.id },
          },
        });
        rolledBackOutboxId = outbox.id;
        throw new Error("injected transaction rollback");
      }),
      /injected transaction rollback/,
    );
    assert.ok(rolledBackTaskId);
    assert.ok(rolledBackOutboxId);
    assert.equal(
      await database.foundationAsyncTask.findUnique({
        where: { id: rolledBackTaskId },
      }),
      null,
    );
    assert.equal(
      await database.outboxMessage.findUnique({
        where: { id: rolledBackOutboxId },
      }),
      null,
    );

    const concurrencyTask = await database.foundationAsyncTask.create({
      data: {},
    });
    foundationTaskIds.push(concurrencyTask.id);
    const concurrencyOutbox = await database.outboxMessage.create({
      data: {
        eventType: foundationJobType,
        payload: { taskId: concurrencyTask.id },
      },
    });
    outboxIds.push(concurrencyOutbox.id);

    const deferredQueue = createDeferredQueue();
    const firstDispatch = dispatchOutboxBatch({
      database,
      queue: deferredQueue.queue,
      telemetry,
      limit: 1,
    });
    await deferredQueue.enqueueStarted;

    assert.equal(
      await dispatchOutboxBatch({
        database,
        queue: deferredQueue.queue,
        telemetry,
        limit: 1,
      }),
      0,
    );
    assert.equal(deferredQueue.enqueueCount, 1);
    deferredQueue.finishEnqueue();
    assert.equal(await firstDispatch, 1);
    assert.ok(
      (
        await database.outboxMessage.findUniqueOrThrow({
          where: { id: concurrencyOutbox.id },
        })
      ).publishedAt,
    );

    const failedPublishTask = await database.foundationAsyncTask.create({
      data: {},
    });
    foundationTaskIds.push(failedPublishTask.id);
    const failedPublishOutbox = await database.outboxMessage.create({
      data: {
        eventType: foundationJobType,
        payload: { taskId: failedPublishTask.id },
      },
    });
    outboxIds.push(failedPublishOutbox.id);
    await assert.rejects(
      dispatchOutboxBatch({
        database,
        queue: createFailingQueue(),
        telemetry,
        limit: 1,
      }),
      /injected queue publish failure/,
    );
    assert.equal(
      (
        await database.outboxMessage.findUniqueOrThrow({
          where: { id: failedPublishOutbox.id },
        })
      ).publishedAt,
      null,
    );

    await database.outboxMessage.deleteMany({
      where: { id: { in: outboxIds } },
    });
    outboxIds.length = 0;

    const { task, outbox } = await database.$transaction(
      async (transaction) => {
        const task = await transaction.foundationAsyncTask.create({
          data: {},
        });
        const outbox = await transaction.outboxMessage.create({
          data: {
            eventType: foundationJobType,
            payloadVersion: 1,
            payload: { taskId: task.id },
          },
        });
        return { task, outbox };
      },
    );
    foundationTaskIds.push(task.id);
    outboxIds.push(outbox.id);

    const queueName = `phase9-${randomUUID().replaceAll("-", "")}`;
    await withSupabaseTestQueue(
      { connectionString: queueDatabaseUrl, queueName },
      async (queue) => {
        const dispatchedEnvelopes: JsonValue[] = [];
        const observedQueue = observeEnqueues(queue, dispatchedEnvelopes);

        assert.equal(
          await dispatchOutboxBatch({
            database,
            queue: observedQueue,
            telemetry,
            limit: 10,
          }),
          1,
        );
        const publishedOutbox = await database.outboxMessage.findUniqueOrThrow({
          where: { id: outbox.id },
        });
        assert.ok(publishedOutbox.publishedAt instanceof Date);
        assert.deepEqual(dispatchedEnvelopes[0], {
          id: outbox.id,
          type: foundationJobType,
          version: 1,
          payload: { taskId: task.id },
        });

        spawnWorkerOnce({ queueName, queueDatabaseUrl });
        const completedTask =
          await database.foundationAsyncTask.findUniqueOrThrow({
            where: { id: task.id },
          });
        assert.ok(completedTask.completedAt instanceof Date);
        const firstCompletion = completedTask.completedAt;
        assert.deepEqual(
          await queue.receive({
            visibilityTimeoutSeconds: 0,
            limit: 10,
          }),
          [],
        );

        await database.outboxMessage.update({
          where: { id: outbox.id },
          data: { publishedAt: null },
        });
        assert.equal(
          await dispatchOutboxBatch({
            database,
            queue: observedQueue,
            telemetry,
            limit: 1,
          }),
          1,
        );
        assert.deepEqual(dispatchedEnvelopes[1], dispatchedEnvelopes[0]);
        spawnWorkerOnce({ queueName, queueDatabaseUrl });
        assert.equal(
          (
            await database.foundationAsyncTask.findUniqueOrThrow({
              where: { id: task.id },
            })
          ).completedAt?.getTime(),
          firstCompletion.getTime(),
        );
        assert.deepEqual(
          await queue.receive({
            visibilityTimeoutSeconds: 0,
            limit: 10,
          }),
          [],
        );

        const retryEnvelope = jobEnvelopeSchema.parse({
          id: randomUUID(),
          type: foundationJobType,
          version: 1,
          payload: { taskId: task.id },
        });
        const retryMessageId = await queue.enqueue(retryEnvelope);
        let handlerAttempts = 0;
        const injectedRetryHandler = registerJobHandler({
          type: foundationJobType,
          version: 1,
          payloadSchema: foundationTaskPayloadSchema,
          async handle() {
            handlerAttempts += 1;
            if (handlerAttempts === 1) {
              throw new Error("injected retryable failure");
            }
          },
        });
        const firstDelivery = (
          await queue.receive({ visibilityTimeoutSeconds: 0, limit: 1 })
        )[0];
        assert.ok(firstDelivery);
        assert.equal(firstDelivery.id, retryMessageId);
        assert.equal(
          await processQueueMessage({
            message: firstDelivery,
            queue,
            telemetry,
            handlers: [injectedRetryHandler],
            maximumAttempts: 3,
          }),
          "retrying",
        );
        const redelivery = (
          await queue.receive({ visibilityTimeoutSeconds: 0, limit: 1 })
        )[0];
        assert.ok(redelivery);
        assert.equal(redelivery.id, retryMessageId);
        assert.equal(redelivery.deliveryCount, 2);
        assert.equal(
          await processQueueMessage({
            message: redelivery,
            queue,
            telemetry,
            handlers: [injectedRetryHandler],
            maximumAttempts: 3,
          }),
          "acknowledged",
        );
        assert.equal(handlerAttempts, 2);

        const exhaustedEnvelope = jobEnvelopeSchema.parse({
          id: randomUUID(),
          type: foundationJobType,
          version: 1,
          payload: { taskId: task.id },
        });
        const exhaustedId = await queue.enqueue(exhaustedEnvelope);
        const exhaustedDelivery = (
          await queue.receive({ visibilityTimeoutSeconds: 0, limit: 1 })
        )[0];
        assert.ok(exhaustedDelivery);
        assert.equal(exhaustedDelivery.id, exhaustedId);
        const alwaysFailsHandler = registerJobHandler({
          type: foundationJobType,
          version: 1,
          payloadSchema: foundationTaskPayloadSchema,
          async handle() {
            throw new Error("injected exhausted failure");
          },
        });
        assert.equal(
          await processQueueMessage({
            message: exhaustedDelivery,
            queue,
            telemetry,
            handlers: [alwaysFailsHandler],
            maximumAttempts: 1,
          }),
          "dead-lettered",
        );
        assert.deepEqual(
          await queue.receive({ visibilityTimeoutSeconds: 0, limit: 10 }),
          [],
        );

        const permanentEnvelope = jobEnvelopeSchema.parse({
          id: randomUUID(),
          type: foundationJobType,
          version: 1,
          payload: { taskId: randomUUID() },
        });
        const permanentId = await queue.enqueue(permanentEnvelope);
        const permanentDelivery = (
          await queue.receive({ visibilityTimeoutSeconds: 0, limit: 1 })
        )[0];
        assert.ok(permanentDelivery);
        assert.equal(permanentDelivery.id, permanentId);
        assert.equal(
          await processQueueMessage({
            message: permanentDelivery,
            queue,
            telemetry,
            handlers: [createFoundationTaskHandler(database)],
            maximumAttempts: 5,
          }),
          "dead-lettered",
        );
        assert.deepEqual(
          await queue.receive({ visibilityTimeoutSeconds: 0, limit: 10 }),
          [],
        );

        const malformedId = await queue.enqueue({ malformed: true });
        const malformedDelivery = (
          await queue.receive({ visibilityTimeoutSeconds: 0, limit: 1 })
        )[0];
        assert.ok(malformedDelivery);
        assert.equal(malformedDelivery.id, malformedId);
        assert.equal(
          await processQueueMessage({
            message: malformedDelivery,
            queue,
            telemetry,
            handlers: [createFoundationTaskHandler(database)],
            maximumAttempts: 5,
          }),
          "dead-lettered",
        );

        const ackFailureTask = await database.foundationAsyncTask.create({
          data: {},
        });
        foundationTaskIds.push(ackFailureTask.id);
        const ackFailureEnvelope = jobEnvelopeSchema.parse({
          id: randomUUID(),
          type: foundationJobType,
          version: 1,
          payload: { taskId: ackFailureTask.id },
        });
        const ackFailureId = await queue.enqueue(ackFailureEnvelope);
        const ackFailureDelivery = (
          await queue.receive({ visibilityTimeoutSeconds: 0, limit: 1 })
        )[0];
        assert.ok(ackFailureDelivery);
        assert.equal(ackFailureDelivery.id, ackFailureId);
        let failAcknowledgement = true;
        const acknowledgementFailureQueue: JobQueue = {
          enqueue: (payload) => queue.enqueue(payload),
          receive: (options) => queue.receive(options),
          async acknowledge(messageId) {
            if (failAcknowledgement) {
              failAcknowledgement = false;
              throw new Error("injected acknowledgement failure");
            }
            return queue.acknowledge(messageId);
          },
          deadLetter: (messageId) => queue.deadLetter(messageId),
        };
        const foundationHandler = createFoundationTaskHandler(database);
        assert.equal(
          await processQueueMessage({
            message: ackFailureDelivery,
            queue: acknowledgementFailureQueue,
            telemetry,
            handlers: [foundationHandler],
            maximumAttempts: 3,
          }),
          "retrying",
        );
        const firstCompletionAt = (
          await database.foundationAsyncTask.findUniqueOrThrow({
            where: { id: ackFailureTask.id },
          })
        ).completedAt;
        assert.ok(firstCompletionAt instanceof Date);

        const ackRedelivery = (
          await queue.receive({ visibilityTimeoutSeconds: 0, limit: 1 })
        )[0];
        assert.ok(ackRedelivery);
        assert.equal(ackRedelivery.id, ackFailureId);
        assert.equal(ackRedelivery.deliveryCount, 2);
        assert.equal(
          await processQueueMessage({
            message: ackRedelivery,
            queue: acknowledgementFailureQueue,
            telemetry,
            handlers: [foundationHandler],
            maximumAttempts: 3,
          }),
          "acknowledged",
        );
        assert.equal(
          (
            await database.foundationAsyncTask.findUniqueOrThrow({
              where: { id: ackFailureTask.id },
            })
          ).completedAt?.getTime(),
          firstCompletionAt.getTime(),
        );
      },
    );
  } finally {
    try {
      if (connected) {
        if (outboxIds.length > 0) {
          await database.outboxMessage.deleteMany({
            where: { id: { in: outboxIds } },
          });
        }
        if (foundationTaskIds.length > 0) {
          await database.foundationAsyncTask.deleteMany({
            where: { id: { in: foundationTaskIds } },
          });
        }
      }
    } finally {
      await database.$disconnect();
    }
  }
});
