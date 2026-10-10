import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  findTypeScriptTestWorkspaces,
  findForbiddenRuntimeArtifacts,
  runtimeArtifactWorkspaceNames,
  validateRuntimeArtifactLists,
} from "./runtime-artifacts.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("production artifacts reject compiled tests and test support", () => {
  assert.deepEqual(
    findForbiddenRuntimeArtifacts([
      "main.js",
      "modules/auth/auth.identity.integration.test.js",
      "test-support/observability.js",
      "fixtures/auth-user.json",
    ]),
    [
      "fixtures/auth-user.json",
      "modules/auth/auth.identity.integration.test.js",
      "test-support/observability.js",
    ],
  );
});

test("production separation retains entrypoints and compiled tests in test output", () => {
  assert.doesNotThrow(() =>
    validateRuntimeArtifactLists({
      productionFiles: ["dist/main.js", "dist/modules/auth/auth.service.js"],
      productionEntrypoints: ["dist/main.js"],
      testFiles: [
        ".test-dist/modules/auth/authentication.unit.test.js",
        ".test-dist/modules/auth/auth.identity.integration.test.js",
      ],
      retainedTests: [
        ".test-dist/modules/auth/authentication.unit.test.js",
        ".test-dist/modules/auth/auth.identity.integration.test.js",
      ],
    }),
  );
});

test("missing test output fails even when the production tree is clean", () => {
  assert.throws(
    () =>
      validateRuntimeArtifactLists({
        productionFiles: ["dist/main.js"],
        productionEntrypoints: ["dist/main.js"],
        testFiles: [],
        retainedTests: [".test-dist/unit.test.js"],
      }),
    /missing test-only artifact/,
  );
});

test("every TypeScript test workspace is covered by production and test artifact checks", async () => {
  const testWorkspaces = await findTypeScriptTestWorkspaces();
  const knownWorkspaces = new Set(runtimeArtifactWorkspaceNames);
  const uncoveredWorkspaces = testWorkspaces.filter(
    (workspace) => !knownWorkspaces.has(workspace),
  );

  assert.deepEqual(uncoveredWorkspaces, []);
  assert.equal(testWorkspaces.length, runtimeArtifactWorkspaceNames.length);

  for (const workspace of testWorkspaces) {
    const manifest = JSON.parse(
      await readFile(
        path.join(repositoryRoot, workspace, "package.json"),
        "utf8",
      ),
    );
    await Promise.all([
      access(path.join(repositoryRoot, workspace, "tsconfig.build.json")),
      access(path.join(repositoryRoot, workspace, "tsconfig.test.json")),
    ]);
    assert.ok(manifest.scripts["test:build"]);
    assert.match(manifest.scripts.test ?? "", /\.test-dist\b/);
  }
});
