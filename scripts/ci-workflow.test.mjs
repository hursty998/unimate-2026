import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const workflow = await readFile(
  path.join(repositoryRoot, ".github/workflows/ci.yml"),
  "utf8",
);
const turbo = JSON.parse(
  await readFile(path.join(repositoryRoot, "turbo.json"), "utf8"),
);

test("foundation CI covers development PRs, development pushes, and manual runs", () => {
  assert.match(
    workflow,
    /pull_request:\s*(?:\n\s+branches:\s*\[development\]|\n\s+branches:\s*\n\s+- development)/,
  );
  assert.match(
    workflow,
    /push:\s*(?:\n\s+branches:\s*\[development\]|\n\s+branches:\s*\n\s+- development)/,
  );
  assert.match(workflow, /workflow_dispatch:/);
});

test("foundation CI uses a read-only pull-request posture and immutable actions", () => {
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.match(workflow, /^\s*contents:\s*read\s*$/m);
  assert.match(workflow, /persist-credentials:\s*false/);
  const actionReferences = [
    ...workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gm),
  ].map((match) => match[1]);

  assert.ok(actionReferences.length > 0);
  assert.ok(
    actionReferences.every((reference) => /@[a-f0-9]{40}$/.test(reference)),
    "every GitHub Action must be pinned to a full commit SHA",
  );
});

test("the single Foundation job delegates quality checks to the canonical verifier", () => {
  assert.match(workflow, /^\s*foundation:\s*$/m);
  assert.match(workflow, /^\s*name:\s*Foundation\s*$/m);
  assert.equal(
    workflow.split(
      "node scripts/verify.mjs --report-json .ci-artifacts/verify.json",
    ).length - 1,
    1,
  );
  assert.match(workflow, /timeout-minutes:\s*25/);
  assert.match(workflow, /cancel-in-progress:\s*true/);
});

test("CI generates the ignored OpenAPI check input before canonical verification", () => {
  const generateOpenApiIndex = workflow.indexOf("run: pnpm openapi:generate");
  const verifyIndex = workflow.indexOf(
    "node scripts/verify.mjs --report-json .ci-artifacts/verify.json",
  );

  assert.notEqual(generateOpenApiIndex, -1);
  assert.notEqual(verifyIndex, -1);
  assert.ok(generateOpenApiIndex < verifyIndex);
  assert.equal(workflow.split("run: pnpm openapi:generate").length - 1, 1);
});

test("Prisma generation receives DIRECT_URL through Turbo strict mode without hashing it", () => {
  assert.deepEqual(turbo.tasks.generate?.passThroughEnv, ["DIRECT_URL"]);
  assert.equal(
    turbo.tasks.generate?.env?.includes("DIRECT_URL") ?? false,
    false,
  );
  assert.equal(turbo.globalEnv?.includes("DIRECT_URL") ?? false, false);
});

test("foundation CI has no hosted credentials, privileged workflow, or deployment commands", () => {
  assert.doesNotMatch(workflow, /secrets\./i);
  assert.doesNotMatch(workflow, /\beas\s+(?:build|update)\b/i);
  assert.doesNotMatch(workflow, /\b(?:vercel|npm\s+publish)\b/i);
  assert.doesNotMatch(workflow, /supabase\s+(?:link|db\s+push)\b/i);
  assert.doesNotMatch(workflow, /prisma\s+db\s+push\b/i);
  assert.match(workflow, /retention-days:\s*7/);
  assert.match(workflow, /path:\s*\.ci-artifacts\/verify\.json/);
  assert.doesNotMatch(
    workflow,
    /playwright.*(?:trace|video)|(?:trace|video).*playwright/i,
  );
  const artifactStep = workflow.split(
    "name: Upload safe verification report",
  )[1];
  assert.match(artifactStep, /DATABASE_URL:\s*""/);
  assert.match(artifactStep, /SUPABASE_SECRET_KEY:\s*""/);
});
