import assert from "node:assert/strict";
import { test } from "node:test";
import { getFoundationUpdateSource } from "./update-diagnostics.ts";

test("identifies a published update by its ID and non-embedded launch", () => {
  assert.equal(
    getFoundationUpdateSource("b782815a-5c2e-46c8-8e0a-d185e04fd9ca", false),
    "Published EAS Update",
  );
});

test("identifies an embedded launch even when an update ID is present", () => {
  assert.equal(
    getFoundationUpdateSource("b782815a-5c2e-46c8-8e0a-d185e04fd9ca", true),
    "Embedded bundle",
  );
});

test("does not label a bundle as published without an update ID", () => {
  assert.equal(
    getFoundationUpdateSource(null, false),
    "Metro or unclassified bundle",
  );
});
