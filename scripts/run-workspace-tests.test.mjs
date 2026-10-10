import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { discoverTestFiles, runTestFiles } from "./run-workspace-tests.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function writeFixture(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

test("nested non-integration tests are discovered and run automatically", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "unimate-test-discovery-"),
  );
  const marker = path.join(directory, "discovered-test-ran");

  try {
    await writeFixture(
      directory,
      "src/features/events/create.test.mjs",
      `import { writeFile } from "node:fs/promises";\nimport test from "node:test";\ntest("future nested test", async () => writeFile(${JSON.stringify(marker)}, "ran"));\n`,
    );
    const files = await discoverTestFiles(["."], { cwd: directory });

    assert.deepEqual(
      files.map((filePath) => path.relative(directory, filePath)),
      ["src/features/events/create.test.mjs"],
    );
    assert.equal(runTestFiles(files, { cwd: directory, stdio: "ignore" }), 0);
    assert.equal(await readFile(marker, "utf8"), "ran");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("discovery excludes nested integration tests and sorts results deterministically", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "unimate-test-discovery-"),
  );

  try {
    await Promise.all([
      writeFixture(directory, "src/zeta/future.test.mjs", "export {};\n"),
      writeFixture(directory, "src/alpha/future.test.js", "export {};\n"),
      writeFixture(
        directory,
        "src/alpha/future.integration.test.mjs",
        "export {};\n",
      ),
      writeFixture(directory, "src/alpha/integration.test.ts", "export {};\n"),
      writeFixture(directory, "src/alpha/future.test.tsx", "export {};\n"),
    ]);
    const expected = ["src/alpha/future.test.js", "src/zeta/future.test.mjs"];

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const files = await discoverTestFiles(["."], { cwd: directory });
      assert.deepEqual(
        files.map((filePath) => path.relative(directory, filePath)),
        expected,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("failing discovered tests propagate a non-zero Node test-runner status", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "unimate-test-discovery-"),
  );

  try {
    await writeFixture(
      directory,
      "src/features/events/failing.test.mjs",
      'import test from "node:test";\ntest("fails", () => assert.fail("fixture failure"));\nimport assert from "node:assert/strict";\n',
    );
    const files = await discoverTestFiles(["."], { cwd: directory });

    assert.equal(runTestFiles(files, { cwd: directory, stdio: "ignore" }), 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("mobile's current Node-supported package tests remain discoverable", async () => {
  const mobileRoot = path.join(repositoryRoot, "apps/mobile");
  const files = await discoverTestFiles(["plugins", "src"], {
    cwd: mobileRoot,
  });
  const relativeFiles = files.map((filePath) =>
    path.relative(mobileRoot, filePath),
  );

  assert.ok(
    relativeFiles.includes("plugins/with-ios-scene-lifecycle.test.mjs"),
  );
  assert.ok(
    relativeFiles.includes("src/lib/auth/secure-session-storage.test.ts"),
  );
  assert.ok(
    files.every((filePath) => [".mjs", ".ts"].includes(path.extname(filePath))),
  );
});
