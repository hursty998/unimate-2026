import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  JobQueue,
  JsonValue,
  QueueMessageId,
  ReceivedQueueMessage,
} from "./index.js";

test("JobQueue can be implemented by a provider-free deterministic fake", async () => {
  const messages = new Map<string, JsonValue>();
  let nextId = 1;
  const queue: JobQueue = {
    async enqueue(payload) {
      const id = `fake-${nextId++}`;
      messages.set(id, payload);
      return id as QueueMessageId;
    },
    async receive() {
      return [...messages].map(([id, payload]): ReceivedQueueMessage => ({
        id: id as QueueMessageId,
        payload,
        deliveryCount: 1,
      }));
    },
    async acknowledge(id) {
      return messages.delete(id);
    },
  };
  const payload = {
    kind: "foundation-test",
    version: 1,
    data: { value: "synthetic" },
  } satisfies JsonValue;

  const id = await queue.enqueue(payload);

  assert.deepEqual(
    await queue.receive({ visibilityTimeoutSeconds: 5, limit: 1 }),
    [{ id, payload, deliveryCount: 1 }],
  );
  assert.equal(await queue.acknowledge(id), true);
  assert.equal(await queue.acknowledge(id), false);
  assert.deepEqual(
    await queue.receive({ visibilityTimeoutSeconds: 5, limit: 1 }),
    [],
  );
});
