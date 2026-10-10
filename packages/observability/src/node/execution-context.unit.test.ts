import assert from "node:assert/strict";
import { test } from "node:test";
import { AsyncExecutionContext } from "./execution-context.js";

test("isolates concurrent execution contexts across asynchronous work", async () => {
  const contexts = new AsyncExecutionContext();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = ["correlation-a", "correlation-b"].map((correlationId) =>
    contexts.run({ correlationId, requestId: correlationId }, async () => {
      await gate;
      return contexts.current();
    }),
  );

  release();
  const results = await Promise.all(pending);

  assert.deepEqual(results.map((result) => result?.correlationId).sort(), [
    "correlation-a",
    "correlation-b",
  ]);
  assert.equal(contexts.current(), undefined);
});
