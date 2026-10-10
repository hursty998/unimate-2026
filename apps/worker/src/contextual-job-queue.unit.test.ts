import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FOUNDATION_TASK_COMPLETION_JOB_TYPE,
  jobEnvelopeSchema,
} from "@unimate/jobs";
import type { TelemetryProvider } from "@unimate/observability";
import { AsyncExecutionContext } from "@unimate/observability/node";
import type { JobQueue, JsonValue, QueueMessageId } from "@unimate/queue";
import { ContextualJobQueue } from "./contextual-job-queue.js";

const envelope = {
  id: "0199f4ad-6789-7abc-8def-0123456789ab",
  type: FOUNDATION_TASK_COMPLETION_JOB_TYPE,
  version: 1,
  payload: { taskId: "0199f4ad-6789-7abc-8def-1123456789ab" },
};

test("adds safe context to direct async jobs and preserves explicit metadata", async () => {
  const enqueued: JsonValue[] = [];
  const options: Array<{ delaySeconds?: number } | undefined> = [];
  let closeCount = 0;
  const queue: JobQueue & { close(): Promise<void> } = {
    async enqueue(payload, enqueueOptions) {
      enqueued.push(payload);
      options.push(enqueueOptions);
      return "message-1" as QueueMessageId;
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
    async close() {
      closeCount += 1;
    },
  };
  const executionContext = new AsyncExecutionContext();
  const telemetry: Pick<TelemetryProvider, "capturePropagationContext"> = {
    capturePropagationContext() {
      return {
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        tracestate: "vendor=value",
      };
    },
  };
  const contextualQueue = new ContextualJobQueue(
    queue,
    executionContext,
    telemetry,
  );
  const correlationId = "0199f4ad-6789-7abc-8def-2123456789ab";

  await executionContext.run({ correlationId }, () =>
    contextualQueue.enqueue(envelope, { delaySeconds: 30 }),
  );
  assert.deepEqual(enqueued[0], {
    ...envelope,
    observability: {
      correlationId,
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      tracestate: "vendor=value",
    },
  });
  assert.deepEqual(options[0], { delaySeconds: 30 });

  const explicit = {
    ...envelope,
    observability: { correlationId },
  };
  await contextualQueue.enqueue(explicit);
  assert.deepEqual(enqueued[1], explicit);

  await contextualQueue.enqueue({ malformed: true });
  assert.deepEqual(enqueued[2], { malformed: true });
  assert.equal(jobEnvelopeSchema.safeParse(enqueued[0]).success, true);
  await contextualQueue.close();
  assert.equal(closeCount, 1);
});
