import assert from "node:assert/strict";
import path from "node:path";
import { ESLint } from "eslint";
import { test } from "node:test";
import { URL, fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const eslint = new ESLint({ cwd: repositoryRoot });

async function lintText(source, filePath) {
  const [result] = await eslint.lintText(source, {
    filePath: path.join(repositoryRoot, filePath),
  });

  assert.ok(result);
  return result;
}

test("API features may use ports but not provider implementations", async () => {
  const port = await lintText(
    'import type { ObjectStorage } from "@unimate/storage"; export type Fixture = ObjectStorage;',
    "apps/api/src/modules/provider-boundary.fixture.ts",
  );
  const adapter = await lintText(
    'import { SupabaseObjectStorage } from "@unimate/storage/supabase";',
    "apps/api/src/modules/provider-boundary.fixture.ts",
  );

  assert.equal(port.errorCount, 0);
  assert.ok(
    adapter.messages.some(
      (message) => message.ruleId === "no-restricted-imports",
    ),
  );
});

test("API composition can wire adapter subpaths but not vendor SDKs", async () => {
  const adapter = await lintText(
    'import { SupabaseObjectStorage } from "@unimate/storage/supabase"; export { SupabaseObjectStorage };',
    "apps/api/src/providers/provider-boundary.fixture.ts",
  );
  const sdk = await lintText(
    'import { createClient } from "@supabase/supabase-js"; export { createClient };',
    "apps/api/src/providers/provider-boundary.fixture.ts",
  );

  assert.equal(
    adapter.messages.some(
      (message) => message.ruleId === "no-restricted-imports",
    ),
    false,
  );
  assert.ok(
    sdk.messages.some((message) => message.ruleId === "no-restricted-imports"),
  );
});

test("worker business code uses ports; composition permits adapters but blocks vendor SDKs", async () => {
  const port = await lintText(
    'import type { JobQueue } from "@unimate/queue"; import type { TelemetryProvider } from "@unimate/observability"; export type Fixture = JobQueue | TelemetryProvider;',
    "apps/worker/src/worker-boundary.fixture.ts",
  );
  const businessAdapter = await lintText(
    'import { SupabaseJobQueue } from "@unimate/queue/supabase";',
    "apps/worker/src/worker-boundary.fixture.ts",
  );
  const composedAdapters = await lintText(
    'import { SupabaseJobQueue } from "@unimate/queue/supabase"; import { OpenTelemetryProvider } from "@unimate/observability/opentelemetry";',
    "apps/worker/src/providers/worker-boundary.fixture.ts",
  );
  const vendorImports = await Promise.all(
    [
      'import { createClient } from "@supabase/supabase-js";',
      'import pg from "pg";',
      'import { S3Client } from "@aws-sdk/client-s3";',
      'import Expo from "expo-server-sdk";',
      'import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";',
      'import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";',
    ].map((source) =>
      lintText(source, "apps/worker/src/providers/worker-boundary.fixture.ts"),
    ),
  );

  assert.equal(port.errorCount, 0);
  assert.ok(
    businessAdapter.messages.some(
      (message) => message.ruleId === "no-restricted-imports",
    ),
  );
  assert.equal(
    composedAdapters.messages.some(
      (message) => message.ruleId === "no-restricted-imports",
    ),
    false,
  );
  for (const result of vendorImports) {
    assert.ok(
      result.messages.some(
        (message) => message.ruleId === "no-restricted-imports",
      ),
    );
  }
});

test("mobile cannot import server queue or storage adapters", async () => {
  const queue = await lintText(
    'import type { JobQueue } from "@unimate/queue";',
    "apps/mobile/src/provider-boundary.fixture.ts",
  );
  const storage = await lintText(
    'import { SupabaseObjectStorage } from "@unimate/storage/supabase";',
    "apps/mobile/src/provider-boundary.fixture.ts",
  );

  assert.ok(
    queue.messages.some(
      (message) => message.ruleId === "no-restricted-imports",
    ),
  );
  assert.ok(
    storage.messages.some(
      (message) => message.ruleId === "no-restricted-imports",
    ),
  );
});

test("provider packages cannot depend on unrelated provider packages", async () => {
  const result = await lintText(
    'import type { PushProvider } from "@unimate/notifications";',
    "packages/storage/src/provider-boundary.fixture.ts",
  );

  assert.ok(
    result.messages.some(
      (message) => message.ruleId === "no-restricted-imports",
    ),
  );
});
