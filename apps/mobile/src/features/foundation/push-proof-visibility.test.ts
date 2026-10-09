import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldShowFoundationPushProof } from "./push-proof-visibility.ts";

test("foundation push proof is visible only in development after identity resolution", () => {
  assert.equal(shouldShowFoundationPushProof(false, true), false);
  assert.equal(shouldShowFoundationPushProof(true, false), false);
  assert.equal(shouldShowFoundationPushProof(true, true), true);
});
