import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import type { JsonValue } from "./index.js";
import { withSupabaseTestQueue } from "./supabase-test-support.js";

const connectionString = process.env["SUPABASE_TEST_DATABASE_URL"];

if (connectionString === undefined) {
  throw new Error(
    "SUPABASE_TEST_DATABASE_URL is required for the local Supabase queue integration test.",
  );
}

test("Supabase Queues sends, reserves, redelivers, and acknowledges a message", async () => {
  const queueName = `phase7-test-${randomUUID().replaceAll("-", "")}`;
  const payload = {
    fixture: "phase7-provider-test",
    value: "round-trip",
  } satisfies JsonValue;

  await withSupabaseTestQueue(
    { connectionString, queueName },
    async (queue) => {
      const id = await queue.enqueue(payload);
      const firstRead = await queue.receive({
        visibilityTimeoutSeconds: 1,
        limit: 1,
      });

      assert.equal(firstRead.length, 1);
      assert.deepEqual(firstRead[0], {
        id,
        payload,
        deliveryCount: 1,
      });
      assert.deepEqual(
        await queue.receive({ visibilityTimeoutSeconds: 1, limit: 1 }),
        [],
      );

      await delay(1_100);

      const redelivery = await queue.receive({
        visibilityTimeoutSeconds: 0,
        limit: 1,
      });
      assert.deepEqual(redelivery, [{ id, payload, deliveryCount: 2 }]);
      assert.equal(await queue.acknowledge(id), true);
      assert.equal(await queue.acknowledge(id), false);
      assert.deepEqual(
        await queue.receive({ visibilityTimeoutSeconds: 0, limit: 1 }),
        [],
      );
    },
  );
});
