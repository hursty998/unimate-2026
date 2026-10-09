import assert from "node:assert/strict";
import { trace, type Span } from "@opentelemetry/api";
import { FOUNDATION_TASK_COMPLETION_JOB_TYPE } from "@unimate/jobs";
import type {
  JobQueue,
  JsonValue,
  QueueMessageId,
  ReceivedQueueMessage,
} from "@unimate/queue";
import type { TelemetryProvider } from "@unimate/observability";
import { z } from "zod";
import { test } from "node:test";
import { processQueueMessage, shouldDeadLetter } from "./consumer.js";
import { parseWorkerConfig } from "./config.js";
import { PermanentJobError } from "./permanent-job-error.js";
import { registerJobHandler, type RegisteredJobHandler } from "./registry.js";
import { runWorkerContinuously } from "./runtime.js";

const jobId = "0199f4ad-6789-7abc-8def-0123456789ab";
const taskId = "0199f4ad-6789-7abc-8def-1123456789ab";
const validEnvelope = {
  id: jobId,
  type: FOUNDATION_TASK_COMPLETION_JOB_TYPE,
  version: 1,
  payload: { taskId },
} satisfies JsonValue;

interface TelemetryRecord {
  readonly name: string;
  readonly attributes: Map<string, boolean>;
}

function createTelemetry(records: TelemetryRecord[] = []): TelemetryProvider {
  return {
    async runInSpan({ name, attributes, operation }) {
      const captured = new Map(
        Object.keys(attributes ?? {}).map((key) => [key, true]),
      );
      const target = trace.getTracer("unimate-worker-tests").startSpan(name);
      const span = new Proxy(target, {
        get(spanTarget, property) {
          if (property === "setAttribute") {
            return (key: string) => {
              captured.set(key, true);
              return spanTarget;
            };
          }

          if (property === "setAttributes") {
            return (values: object) => {
              for (const key of Object.keys(values)) {
                captured.set(key, true);
              }
              return spanTarget;
            };
          }

          const value = Reflect.get(spanTarget, property, spanTarget);
          return typeof value === "function" ? value.bind(spanTarget) : value;
        },
      }) as Span;

      try {
        return await operation(span);
      } finally {
        span.end();
        records.push({ name, attributes: captured });
      }
    },
  };
}

function createQueue() {
  const state = {
    acknowledgements: [] as QueueMessageId[],
    deadLetters: [] as QueueMessageId[],
    acknowledgementFailure: undefined as unknown,
    deadLetterFailure: undefined as unknown,
    deadLetterResult: true,
  };
  const queue: JobQueue = {
    async enqueue() {
      return "1" as QueueMessageId;
    },
    async receive() {
      return [];
    },
    async acknowledge(id) {
      state.acknowledgements.push(id);
      if (state.acknowledgementFailure !== undefined) {
        throw state.acknowledgementFailure;
      }
      return true;
    },
    async deadLetter(id) {
      state.deadLetters.push(id);
      if (state.deadLetterFailure !== undefined) {
        throw state.deadLetterFailure;
      }
      return state.deadLetterResult;
    },
  };

  return { queue, state };
}

function createMessage(
  payload: JsonValue = validEnvelope,
  deliveryCount = 1,
): ReceivedQueueMessage {
  return {
    id: "1" as QueueMessageId,
    payload,
    deliveryCount,
  };
}

function createTestHandler(
  handle: (input: { id: string; payload: { taskId: string } }) => Promise<void>,
): RegisteredJobHandler {
  return registerJobHandler({
    type: FOUNDATION_TASK_COMPLETION_JOB_TYPE,
    version: 1,
    payloadSchema: z.object({ taskId: z.uuid() }).strict(),
    handle,
  });
}

test("validates payload before invoking a handler and acknowledges success", async () => {
  const { queue, state } = createQueue();
  const invocations: Array<{ id: string; payload: { taskId: string } }> = [];
  const records: TelemetryRecord[] = [];
  const handler = createTestHandler(async (input) => {
    invocations.push(input);
  });

  assert.equal(
    await processQueueMessage({
      message: createMessage(),
      queue,
      telemetry: createTelemetry(records),
      handlers: [handler],
      maximumAttempts: 5,
    }),
    "acknowledged",
  );
  assert.deepEqual(invocations, [{ id: jobId, payload: { taskId } }]);
  assert.equal(state.acknowledgements.length, 1);
  assert.deepEqual(state.deadLetters, []);
  assert.equal(records[0]?.name, "job.process");
  assert.equal(records[0]?.attributes.has("job.id"), true);
  assert.equal(records[0]?.attributes.has("queue.message_id"), true);
  assert.equal(records[0]?.attributes.has("job.payload"), false);
});

test("malformed payloads, unknown types, and unsupported versions fail closed", async () => {
  const { queue, state } = createQueue();
  let handlerCalls = 0;
  const handler = createTestHandler(async () => {
    handlerCalls += 1;
  });
  const invalidMessages = [
    createMessage({
      ...validEnvelope,
      payload: { taskId: "not-a-uuid" },
    }),
    createMessage({ ...validEnvelope, type: "foundation.unknown" }),
    createMessage({ ...validEnvelope, version: 2 }),
    createMessage({ broken: true }),
  ];

  for (const message of invalidMessages) {
    assert.equal(
      await processQueueMessage({
        message,
        queue,
        telemetry: createTelemetry(),
        handlers: [handler],
        maximumAttempts: 5,
      }),
      "dead-lettered",
    );
  }

  assert.equal(handlerCalls, 0);
  assert.equal(state.deadLetters.length, invalidMessages.length);
  assert.deepEqual(state.acknowledgements, []);
});

test("retries handler failures through redelivery and dead-letters at the limit", async () => {
  const { queue, state } = createQueue();
  const handler = createTestHandler(async () => {
    throw new Error("temporary injected failure");
  });

  assert.equal(
    await processQueueMessage({
      message: createMessage(validEnvelope, 1),
      queue,
      telemetry: createTelemetry(),
      handlers: [handler],
      maximumAttempts: 2,
    }),
    "retrying",
  );
  assert.deepEqual(state.acknowledgements, []);
  assert.deepEqual(state.deadLetters, []);

  assert.equal(
    await processQueueMessage({
      message: createMessage(validEnvelope, 2),
      queue,
      telemetry: createTelemetry(),
      handlers: [handler],
      maximumAttempts: 2,
    }),
    "dead-lettered",
  );
  assert.equal(state.deadLetters.length, 1);
});

test("permanent handler failures dead-letter immediately", async () => {
  const { queue, state } = createQueue();
  const handler = createTestHandler(async () => {
    throw new PermanentJobError("Referenced record is absent.");
  });

  assert.equal(
    await processQueueMessage({
      message: createMessage(validEnvelope, 1),
      queue,
      telemetry: createTelemetry(),
      handlers: [handler],
      maximumAttempts: 5,
    }),
    "dead-lettered",
  );
  assert.equal(state.deadLetters.length, 1);
  assert.deepEqual(state.acknowledgements, []);
});

test("acknowledgement failure leaves a successful side effect safe to redeliver", async () => {
  const { queue, state } = createQueue();
  const completedTasks = new Set<string>();
  let handlerInvocations = 0;
  const handler = createTestHandler(async ({ payload }) => {
    handlerInvocations += 1;
    completedTasks.add(payload.taskId);
  });
  state.acknowledgementFailure = new Error("injected acknowledgement failure");

  assert.equal(
    await processQueueMessage({
      message: createMessage(),
      queue,
      telemetry: createTelemetry(),
      handlers: [handler],
      maximumAttempts: 3,
    }),
    "retrying",
  );
  assert.equal(completedTasks.has(taskId), true);

  state.acknowledgementFailure = undefined;
  assert.equal(
    await processQueueMessage({
      message: createMessage(validEnvelope, 2),
      queue,
      telemetry: createTelemetry(),
      handlers: [handler],
      maximumAttempts: 3,
    }),
    "acknowledged",
  );
  assert.equal(handlerInvocations, 2);
  assert.equal(completedTasks.size, 1);
});

test("failed dead-lettering leaves the active message unacknowledged", async () => {
  const handler = createTestHandler(async () => {
    throw new PermanentJobError("Permanent test failure.");
  });

  for (const failure of ["rejected", "unavailable"] as const) {
    const { queue, state } = createQueue();
    if (failure === "rejected") {
      state.deadLetterResult = false;
    } else {
      state.deadLetterFailure = new Error("injected provider failure");
    }

    assert.equal(
      await processQueueMessage({
        message: createMessage(),
        queue,
        telemetry: createTelemetry(),
        handlers: [handler],
        maximumAttempts: 5,
      }),
      "dead-letter-failed",
    );
    assert.deepEqual(state.acknowledgements, []);
  }
});

test("classifies permanent and exhausted failures for dead-lettering", () => {
  assert.equal(shouldDeadLetter(new Error("temporary"), 1, 3), false);
  assert.equal(shouldDeadLetter(new Error("temporary"), 3, 3), true);
  assert.equal(shouldDeadLetter(new PermanentJobError("invalid"), 1, 3), true);
});

test("continuous mode waits between idle cycles and stops cleanly on abort", async () => {
  const controller = new AbortController();
  let cycleCount = 0;

  await runWorkerContinuously({
    config: parseWorkerConfig({
      DATABASE_URL: "postgresql://worker:local@127.0.0.1:55322/postgres",
      QUEUE_DATABASE_URL: "postgresql://worker:local@127.0.0.1:55322/postgres",
      WORKER_POLL_INTERVAL_MS: "30000",
    }),
    signal: controller.signal,
    async runCycle() {
      cycleCount += 1;
      setImmediate(() => controller.abort());
      return {
        dispatched: 0,
        received: 0,
        acknowledged: 0,
        retrying: 0,
        deadLettered: 0,
        deadLetterFailures: 0,
      };
    },
    onCycleError(error) {
      assert.fail(`unexpected worker cycle error: ${String(error)}`);
    },
  });

  assert.equal(cycleCount, 1);
});
