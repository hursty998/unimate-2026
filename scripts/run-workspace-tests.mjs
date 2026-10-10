import { spawnSync } from "node:child_process";
import { glob, lstat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const supportedExtensions = new Set([".js", ".mjs", ".ts"]);
const ignoredDirectories = new Set([
  ".expo",
  ".git",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

function isIntegrationTest(filePath) {
  const name = path.basename(filePath);
  return (
    /^integration\.test\.(?:js|mjs|ts)$/.test(name) ||
    /\.(?:integration)\.test\.(?:js|mjs|ts)$/.test(name)
  );
}

function isIgnoredPath(filePath) {
  return filePath
    .split(/[\\/]/)
    .some((segment) => ignoredDirectories.has(segment));
}

export async function discoverTestFiles(roots, { cwd = process.cwd() } = {}) {
  if (roots.length === 0) {
    throw new Error("Provide at least one test discovery root.");
  }

  const discovered = new Set();

  for (const root of roots) {
    const absoluteRoot = path.resolve(cwd, root);
    let rootInfo;
    try {
      rootInfo = await lstat(absoluteRoot);
    } catch (error) {
      throw new Error(`Cannot access test discovery root ${absoluteRoot}.`, {
        cause: error,
      });
    }
    if (!rootInfo.isDirectory()) {
      throw new Error(
        `Test discovery root is not a directory: ${absoluteRoot}`,
      );
    }

    for await (const entry of glob("**/*.test.*", {
      cwd: absoluteRoot,
      exclude: isIgnoredPath,
    })) {
      if (!supportedExtensions.has(path.extname(entry))) {
        continue;
      }
      if (isIntegrationTest(entry)) {
        continue;
      }

      const absolutePath = path.resolve(absoluteRoot, entry);
      if ((await lstat(absolutePath)).isFile()) {
        discovered.add(absolutePath);
      }
    }
  }

  return [...discovered].sort();
}

export function runTestFiles(
  files,
  { cwd = process.cwd(), stdio = "inherit" } = {},
) {
  if (files.length === 0) {
    process.stderr.write(
      "No supported non-integration test files were found.\n",
    );
    return 1;
  }

  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", ...files], {
    cwd,
    env,
    stdio,
  });

  if (result.error) {
    throw new Error(
      `Could not start Node test runner: ${result.error.message}`,
      {
        cause: result.error,
      },
    );
  }
  if (result.status !== null) {
    return result.status;
  }
  if (result.signal && os.constants.signals[result.signal]) {
    return 128 + os.constants.signals[result.signal];
  }
  return 1;
}

async function main() {
  const roots = process.argv.slice(2);
  if (roots.length === 0) {
    process.stderr.write(
      "Usage: node scripts/run-workspace-tests.mjs <root> [<root> ...]\n",
    );
    process.exitCode = 2;
    return;
  }

  const files = await discoverTestFiles(roots);
  process.exitCode = runTestFiles(files);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Workspace test discovery failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
