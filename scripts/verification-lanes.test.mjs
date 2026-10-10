import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { changedSteps, fullSteps } from "./verify.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const rootPackage = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
);

function preparedIntegrationScripts(scripts) {
  return Object.keys(scripts).filter((name) => name.endsWith(":test:prepared"));
}

function countScriptInvocations(steps, script) {
  return steps.reduce(
    (count, step) =>
      count +
      (step.command === "pnpm"
        ? step.args.filter((argument) => argument === script).length
        : 0),
    0,
  );
}

function assertPreparedIntegrationLanesCovered(scripts, full, changed) {
  for (const script of preparedIntegrationScripts(scripts)) {
    assert.equal(
      countScriptInvocations(full, script),
      1,
      `${script} must appear exactly once in full verification`,
    );
    assert.equal(
      countScriptInvocations(changed, script),
      0,
      `${script} must not appear in changed verification`,
    );
  }
}

test("every root prepared integration lane is wired once in full and never in changed verification", () => {
  const integrations = preparedIntegrationScripts(rootPackage.scripts);

  assert.ok(integrations.length > 0);
  assertPreparedIntegrationLanesCovered(
    rootPackage.scripts,
    fullSteps,
    changedSteps,
  );
  assert.equal(integrations.includes("db:check:prepared"), false);
  assert.equal(integrations.includes("openapi:check:prepared"), false);
});

test("an omitted newly-added prepared integration lane fails the wiring invariant", () => {
  assert.throws(
    () =>
      assertPreparedIntegrationLanesCovered(
        { "future:test:prepared": "node future-integration-test.mjs" },
        fullSteps,
        changedSteps,
      ),
    /future:test:prepared must appear exactly once in full verification/,
  );
});

test("full verification includes secret scanning and changed verification does not", () => {
  assert.equal(countScriptInvocations(fullSteps, "secrets:check"), 1);
  assert.equal(countScriptInvocations(changedSteps, "secrets:check"), 0);
});
