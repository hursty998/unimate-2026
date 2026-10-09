import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  JobQueue,
  JsonValue,
  QueueMessageId,
  ReceivedQueueMessage,
} from "./index.js";
import { toJsonValue } from "./json-value.js";
import { parseQueueRow } from "./queue-row.js";
import { SupabaseJobQueue } from "./supabase.js";

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
    async deadLetter(id) {
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

  const deadLetterId = await queue.enqueue(payload);
  assert.equal(await queue.deadLetter(deadLetterId), true);
  assert.equal(await queue.deadLetter(deadLetterId), false);
  assert.deepEqual(
    await queue.receive({ visibilityTimeoutSeconds: 5, limit: 1 }),
    [],
  );
});

test("JSON-parsed __proto__ properties round-trip as own JSON data", () => {
  const input: unknown = JSON.parse(
    '{"__proto__":{"polluted":true},"nested":{"__proto__":"value"}}',
  );
  const normalized = toJsonValue(input);
  const serialized = JSON.stringify(normalized);

  assert.equal(typeof serialized, "string");
  assert.deepEqual(JSON.parse(serialized), input);
  assert.equal(Object.getPrototypeOf(normalized), Object.prototype);
  assert.equal(
    Object.prototype.hasOwnProperty.call(normalized, "__proto__"),
    true,
  );
});

test("rejects queue names beyond the documented PGMQ limit", () => {
  assert.throws(
    () =>
      new SupabaseJobQueue({
        connectionString: "postgresql://worker:local@127.0.0.1/postgres",
        queueName: "q".repeat(49),
      }),
    /up to 48/,
  );
});

test("rejects malformed PGMQ rows with provider-neutral queue semantics", () => {
  const validRow = {
    message_id: "12",
    read_count: 1,
    message: { fixture: "phase7-test" },
  };

  assert.deepEqual(parseQueueRow(validRow), {
    id: "12",
    payload: { fixture: "phase7-test" },
    deliveryCount: 1,
  });

  for (const row of [
    { ...validRow, message_id: "0" },
    { ...validRow, message_id: "9223372036854775808" },
    { ...validRow, read_count: 0 },
    { ...validRow, read_count: Number.MAX_SAFE_INTEGER + 1 },
    { ...validRow, message: new Date() },
  ]) {
    assert.throws(
      () => parseQueueRow(row),
      (error: unknown) =>
        error instanceof Error &&
        "kind" in error &&
        error.kind === "rejected" &&
        "operation" in error &&
        error.operation === "receive",
    );
  }
});
