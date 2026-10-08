import "reflect-metadata";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { relative, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { Controller, Get } from "@nestjs/common";
import { API_ACCESS_POSTURE_METADATA } from "./modules/auth/access-posture.decorator.js";
import { analyzeAccessPostureSource } from "./test-support/access-posture-source-analysis.js";
import { Capabilities } from "@unimate/authorization";
import { RequireCapability } from "./modules/authorization/require-capability.decorator.js";

const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(path);
    }

    return entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts")
      ? [path]
      : [];
  });
}

test("every production API operation has one effective access posture", () => {
  let operationCount = 0;

  for (const path of sourceFiles(sourceDirectory)) {
    const { operationCount: fileOperationCount, issues } =
      analyzeAccessPostureSource(readFileSync(path, "utf8"), path);
    operationCount += fileOperationCount;

    assert.deepEqual(
      issues,
      [],
      issues
        .map(
          ({ line, message }) =>
            `${relative(sourceDirectory, path)}:${line} ${message}`,
        )
        .join("\n"),
    );
  }

  assert.ok(operationCount > 0, "No production API operations were found.");
});

test("source analysis rejects an operation with no posture", () => {
  const result = analyzeAccessPostureSource(
    "@Controller()\nclass ExampleController {\n  @Get()\n  action() {}\n}",
    "fixture.ts",
  );

  assert.ok(result.issues.some((issue) => issue.declaration === "operation"));
});

test("one method posture passes and multiple method postures fail", () => {
  const valid = analyzeAccessPostureSource(
    "@Controller()\nclass ExampleController {\n  @Get()\n  @Public()\n  action() {}\n}",
    "fixture.ts",
  );
  const conflicting = analyzeAccessPostureSource(
    "@Controller()\nclass ExampleController {\n  @Get()\n  @Public()\n  @Authenticated()\n  action() {}\n}",
    "fixture.ts",
  );

  assert.deepEqual(valid.issues, []);
  assert.ok(
    conflicting.issues.some((issue) => issue.declaration === "operation"),
  );
});

test("one controller posture passes and a method posture overrides it", () => {
  const classPosture = analyzeAccessPostureSource(
    "@Authenticated()\n@Controller()\nclass ExampleController {\n  @Get()\n  action() {}\n}",
    "fixture.ts",
  );
  const methodOverride = analyzeAccessPostureSource(
    "@Authenticated()\n@Controller()\nclass ExampleController {\n  @Get()\n  @Public()\n  publicOverride() {}\n\n  @Get()\n  @RequireCapability('platform.authorization.manage')\n  authorizedOverride() {}\n}",
    "fixture.ts",
  );

  assert.deepEqual(classPosture.issues, []);
  assert.deepEqual(methodOverride.issues, []);
});

test("conflicting controller postures fail even when a method overrides them", () => {
  const result = analyzeAccessPostureSource(
    "@Public()\n@Authenticated()\n@Controller()\nclass ExampleController {\n  @Get()\n  @Public()\n  action() {}\n}",
    "fixture.ts",
  );

  assert.ok(result.issues.some((issue) => issue.declaration === "controller"));
});

@Controller()
class CapabilityPostureFixture {
  @Get()
  @RequireCapability(Capabilities.PLATFORM_AUTHORIZATION_MANAGE)
  action() {}
}

test("RequireCapability declares AUTHORISED posture metadata", () => {
  assert.equal(
    Reflect.getMetadata(
      API_ACCESS_POSTURE_METADATA,
      CapabilityPostureFixture.prototype.action,
    ),
    "AUTHORISED",
  );
});
