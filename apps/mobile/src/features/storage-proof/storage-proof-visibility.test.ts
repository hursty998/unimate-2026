import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldShowStorageProof } from "./storage-proof-visibility.ts";

test("storage proof is visible only in development after identity resolution", () => {
  assert.equal(shouldShowStorageProof(false, true), false);
  assert.equal(shouldShowStorageProof(true, false), false);
  assert.equal(shouldShowStorageProof(true, true), true);
});
