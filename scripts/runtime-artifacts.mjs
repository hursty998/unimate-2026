import { glob, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const deployableWorkspaces = [
  {
    name: "packages/auth",
    productionEntrypoints: ["dist/index.js"],
    retainedTests: [".test-dist/index.test.js"],
  },
  {
    name: "packages/authorization",
    productionEntrypoints: ["dist/index.js"],
    retainedTests: [".test-dist/index.test.js"],
  },
  {
    name: "packages/jobs",
    productionEntrypoints: ["dist/index.js"],
    retainedTests: [
      ".test-dist/envelope.unit.test.js",
      ".test-dist/foundation-push.unit.test.js",
    ],
  },
  {
    name: "packages/notifications",
    productionEntrypoints: ["dist/index.js", "dist/expo.js"],
    retainedTests: [".test-dist/expo.unit.test.js"],
  },
  {
    name: "packages/observability",
    productionEntrypoints: [
      "dist/index.js",
      "dist/node/index.js",
      "dist/opentelemetry.js",
    ],
    retainedTests: [
      ".test-dist/node/config.unit.test.js",
      ".test-dist/opentelemetry.unit.test.js",
    ],
  },
  {
    name: "apps/api",
    productionEntrypoints: [
      "dist/main.js",
      "dist/generate-openapi.js",
      "dist/check-openapi.js",
    ],
    retainedTests: [
      ".test-dist/modules/auth/authentication.unit.test.js",
      ".test-dist/modules/auth/auth.identity.integration.test.js",
    ],
  },
  {
    name: "apps/worker",
    productionEntrypoints: ["dist/main.js"],
    retainedTests: [
      ".test-dist/worker.unit.test.js",
      ".test-dist/worker.integration.test.js",
      ".test-dist/test-support/observability.js",
    ],
  },
  {
    name: "packages/database",
    productionEntrypoints: ["dist/index.js"],
    retainedTests: [".test-dist/integration.test.js"],
  },
  {
    name: "packages/queue",
    productionEntrypoints: ["dist/index.js", "dist/supabase.js"],
    retainedTests: [
      ".test-dist/queue.unit.test.js",
      ".test-dist/supabase.integration.test.js",
      ".test-dist/supabase-test-support.js",
    ],
  },
  {
    name: "packages/storage",
    productionEntrypoints: ["dist/index.js", "dist/supabase.js"],
    retainedTests: [
      ".test-dist/supabase.unit.test.js",
      ".test-dist/supabase.integration.test.js",
      ".test-dist/supabase-test-support.unit.test.js",
    ],
  },
];
export const runtimeArtifactWorkspaceNames = deployableWorkspaces
  .map(({ name }) => name)
  .sort();

const forbiddenDirectoryNames = new Set([
  "__tests__",
  "fixtures",
  "test-fixtures",
  "test-support",
  "tests",
]);

function isForbiddenRuntimePath(filePath) {
  const segments = filePath
    .split(/[\\/]/)
    .map((segment) => segment.toLowerCase());
  const filename = segments.at(-1) ?? "";

  return (
    segments.some((segment) => forbiddenDirectoryNames.has(segment)) ||
    /(?:^|[.-])(?:integration[.-])?(?:test|spec)(?:[.-]|$)/i.test(filename) ||
    /(?:^|[.-])test-support(?:[.-]|$)/i.test(filename) ||
    /(?:^|[.-])test-fixture(?:s)?(?:[.-]|$)/i.test(filename)
  );
}

export function findForbiddenRuntimeArtifacts(paths) {
  return paths.filter(isForbiddenRuntimePath).sort();
}

export async function findTypeScriptTestWorkspaces(root = repositoryRoot) {
  const workspaces = [];

  for (const directoryName of ["apps", "packages"]) {
    const directoryPath = path.join(root, directoryName);
    const entries = await readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const workspaceRoot = path.join(directoryPath, entry.name);
      const manifestPath = path.join(workspaceRoot, "package.json");
      let manifest;
      try {
        manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      } catch (error) {
        if (error?.code === "ENOENT") {
          continue;
        }
        throw error;
      }

      if (!/\btsc\b/.test(manifest.scripts?.build ?? "")) {
        continue;
      }

      const testFileIterator = glob("src/**/*.test.ts", {
        cwd: workspaceRoot,
      })[Symbol.asyncIterator]();
      if (!(await testFileIterator.next()).done) {
        workspaces.push(`${directoryName}/${entry.name}`);
      }
    }
  }

  return workspaces.sort();
}

export function validateRuntimeArtifactLists({
  productionFiles,
  productionEntrypoints,
  testFiles,
  retainedTests,
}) {
  const production = new Set(productionFiles);
  const tests = new Set(testFiles);
  const issues = [
    ...productionEntrypoints
      .filter((filePath) => !production.has(filePath))
      .map((filePath) => `missing production entrypoint ${filePath}`),
    ...retainedTests
      .filter((filePath) => !tests.has(filePath))
      .map((filePath) => `missing test-only artifact ${filePath}`),
    ...findForbiddenRuntimeArtifacts(productionFiles).map(
      (filePath) => `test artifact in production output ${filePath}`,
    ),
  ];

  if (issues.length > 0) {
    throw new Error(issues.join("\n"));
  }
}

async function listFiles(directory, relativeTo = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolutePath, relativeTo)));
    } else if (entry.isFile()) {
      files.push(
        path.relative(relativeTo, absolutePath).split(path.sep).join("/"),
      );
    }
  }

  return files;
}

export async function checkRuntimeArtifacts(root = repositoryRoot) {
  let testSentinelCount = 0;

  for (const workspace of deployableWorkspaces) {
    const workspaceRoot = path.join(root, workspace.name);
    const productionFiles = await listFiles(
      path.join(workspaceRoot, "dist"),
      workspaceRoot,
    );
    const testFiles = await listFiles(
      path.join(workspaceRoot, ".test-dist"),
      workspaceRoot,
    );

    validateRuntimeArtifactLists({
      productionFiles,
      productionEntrypoints: workspace.productionEntrypoints,
      testFiles,
      retainedTests: workspace.retainedTests,
    });
    testSentinelCount += workspace.retainedTests.length;
  }

  return { workspaceCount: deployableWorkspaces.length, testSentinelCount };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const { workspaceCount, testSentinelCount } = await checkRuntimeArtifacts();
    process.stdout.write(
      `Verified ${workspaceCount} production runtime trees and ${testSentinelCount} required test-output sentinels.\n`,
    );
  } catch (error) {
    process.stderr.write(
      `Production runtime artifact check failed:\n${error instanceof Error ? error.message : "Unknown artifact check failure."}\n`,
    );
    process.exitCode = 1;
  }
}
