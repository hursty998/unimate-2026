import assert from "node:assert/strict";
import { trace, type Span } from "@opentelemetry/api";
import { FOUNDATION_TASK_COMPLETION_JOB_TYPE } from "@unimate/jobs";
import { PushProviderError } from "@unimate/notifications";
import {
  JobQueueError,
  type JobQueue,
  type JsonValue,
  type QueueMessageId,
  type ReceivedQueueMessage,
} from "@unimate/queue";
import type {
  TelemetryProvider,
  TracePropagationContext,
} from "@unimate/observability";
import { z } from "zod";
import { test } from "node:test";
import {
  processQueueMessage as processQueueMessageImpl,
  shouldDeadLetter,
} from "./consumer.js";
import { parseWorkerConfig } from "./config.js";
import { PermanentJobError } from "./permanent-job-error.js";
import {
  createJobHandlerRegistry,
  registerJobHandler,
  type RegisteredJobHandler,
} from "./registry.js";
import {
  runWorkerContinuously,
  runWorkerCycle as runWorkerCycleImpl,
  logWorkerCycleFailure,
  type WorkerDependencies,
} from "./runtime.js";
import { createTestObservability } from "./test-support/observability.js";

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

function createTelemetry(
  records: TelemetryRecord[] = [],
  propagationContext?: TracePropagationContext,
): TelemetryProvider {
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
    capturePropagationContext() {
      return propagationContext;
    },
    async runWithPropagationContext(_context, operation) {
      return await operation();
    },
    runWithActiveSpan(_span, operation) {
      return operation();
    },
  };
}

const testObservability = createTestObservability();
type TestObservability = Pick<
  ReturnType<typeof createTestObservability>,
  "executionContext" | "logger" | "errorReporter"
>;

function processQueueMessage(
  input: Omit<
    Parameters<typeof processQueueMessageImpl>[0],
    keyof TestObservability
  >,
  observability: TestObservability = testObservability,
) {
  return processQueueMessageImpl({ ...input, ...observability });
}

function runWorkerCycle(
  input: Omit<WorkerDependencies, keyof TestObservability>,
  observability: TestObservability = testObservability,
) {
  return runWorkerCycleImpl({ ...input, ...observability });
}

function createQueue() {
  const state = {
    acknowledgements: [] as QueueMessageId[],
    deadLetters: [] as QueueMessageId[],
    acknowledgementFailure: undefined as unknown,
    acknowledgementResult: true,
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
      return state.acknowledgementResult;
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
  type = FOUNDATION_TASK_COMPLETION_JOB_TYPE,
  version = 1,
): RegisteredJobHandler {
  return registerJobHandler({
    type,
    version,
    payloadSchema: z.object({ taskId: z.uuid() }).strict(),
    handle,
  });
}

function createRegistry(handler: RegisteredJobHandler) {
  return createJobHandlerRegistry([handler]);
}

function workerConfig(batchSize = 2) {
  return parseWorkerConfig({
    DATABASE_URL: "postgresql://worker:local@127.0.0.1:55322/postgres",
    QUEUE_DATABASE_URL: "postgresql://worker:local@127.0.0.1:55322/postgres",
    WORKER_BATCH_SIZE: String(batchSize),
    WORKER_POLL_INTERVAL_MS: "30000",
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
      registry: createRegistry(handler),
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

test("legacy envelopes remain processable and receive local correlation context", async () => {
  const observability = createTestObservability();
  const { queue } = createQueue();
  const outcome = await processQueueMessage(
    {
      message: createMessage(validEnvelope),
      queue,
      telemetry: createTelemetry(),
      registry: createRegistry(createTestHandler(async () => {})),
      maximumAttempts: 5,
    },
    observability,
  );
  const completion = observability.logs.find(
    (log) => log.event === "job.processing.completed",
  );

  assert.equal(outcome, "acknowledged");
  assert.equal(completion?.fields?.["job_id"], jobId);
  assert.equal(typeof completion?.fields?.["correlation_id"], "string");
  assert.equal(completion?.fields?.["queue_message_id"], "1");
  assert.equal(completion?.fields?.["delivery_count"], 1);
});

test("retry and dead-letter preserve the queued correlation and report once", async () => {
  const observability = createTestObservability();
  const { queue, state } = createQueue();
  const correlationId = "0199f4ad-6789-7abc-8def-3123456789ab";
  const envelope = {
    ...validEnvelope,
    observability: { correlationId },
  } satisfies JsonValue;
  const handler = createTestHandler(async () => {
    throw new Error("synthetic retry failure");
  });

  assert.equal(
    await processQueueMessage(
      {
        message: createMessage(envelope, 1),
        queue,
        telemetry: createTelemetry(),
        registry: createRegistry(handler),
        maximumAttempts: 2,
      },
      observability,
    ),
    "retrying",
  );
  assert.equal(observability.reports.length, 0);

  assert.equal(
    await processQueueMessage(
      {
        message: createMessage(envelope, 2),
        queue,
        telemetry: createTelemetry(),
        registry: createRegistry(handler),
        maximumAttempts: 2,
      },
      observability,
    ),
    "dead-lettered",
  );

  const failures = observability.logs.filter(
    (log) => log.event === "job.processing.failed",
  );
  assert.deepEqual(
    failures.map((log) => log.fields?.["correlation_id"]),
    [correlationId, correlationId],
  );
  assert.deepEqual(
    failures.map((log) => log.fields?.["job_id"]),
    [jobId, jobId],
  );
  assert.deepEqual(
    failures.map((log) => log.fields?.["delivery_count"]),
    [1, 2],
  );
  assert.deepEqual(state.deadLetters, ["1"]);
  assert.equal(observability.reports.length, 1);
  assert.equal(observability.reports[0]?.context?.correlationId, correlationId);
});

test("exhausted expected provider failures do not become exception reports", async () => {
  const observability = createTestObservability();
  const { queue } = createQueue();
  const handler = createTestHandler(async () => {
    throw new PushProviderError(
      "transient",
      "synthetic provider retry outcome",
    );
  });

  assert.equal(
    await processQueueMessage(
      {
        message: createMessage(validEnvelope, 1),
        queue,
        telemetry: createTelemetry(),
        registry: createRegistry(handler),
        maximumAttempts: 1,
      },
      observability,
    ),
    "dead-lettered",
  );
  assert.equal(observability.reports.length, 0);
  assert.equal(
    JSON.stringify(observability.logs).includes(
      "synthetic provider retry outcome",
    ),
    false,
  );
});

test("handler registry rejects duplicates but accepts multiple versions", () => {
  const first = createTestHandler(async () => {});
  const secondVersion = createTestHandler(
    async () => {},
    FOUNDATION_TASK_COMPLETION_JOB_TYPE,
    2,
  );
  const registry = createJobHandlerRegistry([first, secondVersion]);

  assert.equal(registry.resolve(first.type, first.version), first);
  assert.equal(
    registry.resolve(secondVersion.type, secondVersion.version),
    secondVersion,
  );
  assert.throws(
    () => createJobHandlerRegistry([first, first]),
    /Duplicate job handler registration/,
  );
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
        registry: createRegistry(handler),
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
      registry: createRegistry(handler),
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
      registry: createRegistry(handler),
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
      registry: createRegistry(handler),
      maximumAttempts: 5,
    }),
    "dead-lettered",
  );
  assert.equal(state.deadLetters.length, 1);
  assert.deepEqual(state.acknowledgements, []);
});

test("acknowledgement returning false treats the successful job as finalised", async () => {
  const { queue, state } = createQueue();
  state.acknowledgementResult = false;
  let sideEffectCount = 0;
  const handler = createTestHandler(async () => {
    sideEffectCount += 1;
  });

  assert.equal(
    await processQueueMessage({
      message: createMessage(validEnvelope, 5),
      queue,
      telemetry: createTelemetry(),
      registry: createRegistry(handler),
      maximumAttempts: 5,
    }),
    "acknowledged",
  );
  assert.equal(sideEffectCount, 1);
  assert.deepEqual(state.deadLetters, []);
});

test("acknowledgement throws below max attempts and preserves idempotent redelivery", async () => {
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
      registry: createRegistry(handler),
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
      registry: createRegistry(handler),
      maximumAttempts: 3,
    }),
    "acknowledged",
  );
  assert.equal(handlerInvocations, 2);
  assert.equal(completedTasks.size, 1);
  assert.deepEqual(state.deadLetters, []);
});

test("acknowledgement throw at max attempts does not dead-letter completed work", async () => {
  const { queue, state } = createQueue();
  state.acknowledgementFailure = new Error("uncertain acknowledgement");
  let sideEffectCount = 0;
  const handler = createTestHandler(async () => {
    sideEffectCount += 1;
  });

  assert.equal(
    await processQueueMessage({
      message: createMessage(validEnvelope, 5),
      queue,
      telemetry: createTelemetry(),
      registry: createRegistry(handler),
      maximumAttempts: 5,
    }),
    "retrying",
  );
  assert.equal(sideEffectCount, 1);
  assert.deepEqual(state.deadLetters, []);
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
        registry: createRegistry(handler),
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

test("outbox dispatch failure remains visible while queued work is consumed", async () => {
  const { queue, state } = createQueue();
  let receiveCount = 0;
  let handlerCalls = 0;
  queue.receive = async () => {
    receiveCount += 1;
    return receiveCount === 1 ? [createMessage()] : [];
  };
  const handler = createTestHandler(async () => {
    handlerCalls += 1;
  });
  const dispatchFailure = new Error("injected outbox failure");
  const result = await runWorkerCycle({
    dispatchOutbox: async () => {
      throw dispatchFailure;
    },
    queue,
    telemetry: createTelemetry(),
    registry: createRegistry(handler),
    config: workerConfig(),
  });

  assert.equal(handlerCalls, 1);
  assert.equal(state.acknowledgements.length, 1);
  assert.equal(result.received, 1);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0]?.stage, "outbox-dispatch");
  assert.equal(result.failures[0]?.cause, dispatchFailure);
});

test("recoverable worker-cycle failures are not sent to ErrorReporter", async () => {
  const observability = createTestObservability();
  const { queue } = createQueue();
  const failure = new JobQueueError("unavailable", "receive");
  queue.receive = async () => {
    throw failure;
  };

  const result = await runWorkerCycle(
    {
      dispatchOutbox: async () => 0,
      queue,
      telemetry: createTelemetry(),
      registry: createRegistry(createTestHandler(async () => {})),
      config: workerConfig(),
    },
    observability,
  );
  for (const failure of result.failures) {
    logWorkerCycleFailure(failure, observability.logger);
  }

  assert.equal(result.failures.length, 1);
  assert.equal(
    observability.logs.filter((log) => log.event === "queue.consume.failed")
      .length,
    1,
  );
  assert.equal(observability.reports.length, 0);
});

test("continuous dead-letter summary does not duplicate the consumer failure event", async () => {
  const observability = createTestObservability();
  const { queue, state } = createQueue();
  state.deadLetterResult = false;
  let receiveCount = 0;
  queue.receive = async () => {
    receiveCount += 1;
    return receiveCount === 1 ? [createMessage()] : [];
  };
  const cycle = await runWorkerCycle(
    {
      dispatchOutbox: async () => 0,
      queue,
      telemetry: createTelemetry(),
      registry: createRegistry(
        createTestHandler(async () => {
          throw new PermanentJobError("Synthetic permanent job failure.");
        }),
      ),
      config: workerConfig(),
    },
    observability,
  );
  const controller = new AbortController();
  let failureCallbacks = 0;

  await runWorkerContinuously({
    config: workerConfig(),
    signal: controller.signal,
    async runCycle() {
      return cycle;
    },
    onCycleFailure(failure) {
      failureCallbacks += 1;
      logWorkerCycleFailure(failure, observability.logger);
      controller.abort();
    },
  });

  assert.equal(cycle.deadLetterFailures, 1);
  assert.equal(failureCallbacks, 1);
  assert.equal(
    observability.logs.filter((log) => log.event === "job.dead-letter.failed")
      .length,
    1,
  );
  assert.equal(observability.reports.length, 0);
});

test("receives the next message only after the preceding handler finishes", async () => {
  const { queue } = createQueue();
  const handledTaskIds: string[] = [];
  const taskIds = [taskId, "0199f4ad-6789-7abc-8def-2123456789ab"];
  let receiveCount = 0;
  queue.receive = async ({ limit }) => {
    assert.equal(limit, 1);
    assert.equal(handledTaskIds.length, receiveCount);
    if (receiveCount === taskIds.length) {
      return [];
    }

    const message = createMessage({
      ...validEnvelope,
      payload: { taskId: taskIds[receiveCount]! },
    });
    receiveCount += 1;
    return [message];
  };
  const handler = createTestHandler(async ({ payload }) => {
    handledTaskIds.push(payload.taskId);
  });
  const result = await runWorkerCycle({
    dispatchOutbox: async () => 0,
    queue,
    telemetry: createTelemetry(),
    registry: createRegistry(handler),
    config: workerConfig(2),
  });

  assert.deepEqual(handledTaskIds, taskIds);
  assert.equal(result.received, 2);
  assert.equal(receiveCount, 2);
});

test("continuous mode reports dispatch failures and backs off after the cycle", async () => {
  const controller = new AbortController();
  let cycleCount = 0;
  const observedFailures: Array<{ stage: string; cause: unknown }> = [];

  await runWorkerContinuously({
    config: workerConfig(),
    signal: controller.signal,
    async runCycle() {
      cycleCount += 1;
      return {
        dispatched: 0,
        received: 1,
        acknowledged: 1,
        retrying: 0,
        deadLettered: 0,
        deadLetterFailures: 0,
        failures: [
          {
            stage: "outbox-dispatch",
            cause: new Error("injected outbox failure"),
          },
        ],
      };
    },
    onCycleFailure(failure) {
      observedFailures.push(failure);
      setImmediate(() => controller.abort());
    },
  });

  assert.equal(cycleCount, 1);
  assert.equal(observedFailures.length, 1);
  assert.equal(observedFailures[0]?.stage, "outbox-dispatch");
});

test("continuous mode waits between idle cycles and stops cleanly on abort", async () => {
  const controller = new AbortController();
  let cycleCount = 0;

  await runWorkerContinuously({
    config: workerConfig(),
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
        failures: [],
      };
    },
    onCycleFailure(failure) {
      assert.fail(`unexpected worker cycle error: ${String(failure.cause)}`);
    },
  });

  assert.equal(cycleCount, 1);
});
