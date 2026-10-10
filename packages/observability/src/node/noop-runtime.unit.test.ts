import assert from "node:assert/strict";
import { test } from "node:test";
import type { NodeObservabilityConfig } from "./config.js";
import { startNodeObservabilityRuntime } from "./runtime.js";

test("no-export runtime still creates active trace context and shuts down", async () => {
  const runtime = startNodeObservabilityRuntime({
    serviceName: "unimate-no-export-test",
    config: {
      environment: "test",
      logLevel: "silent",
      traceExporter: "none",
      slowQueryThresholdMilliseconds: 250,
    } satisfies NodeObservabilityConfig,
  });
  let traceId: string | undefined;
  let spanId: string | undefined;

  try {
    await runtime.telemetry.runInSpan({
      name: "no-export.operation",
      operation(span) {
        ({ traceId, spanId } = span.spanContext());
      },
    });
  } finally {
    await runtime.shutdown();
  }

  assert.match(traceId ?? "", /^[0-9a-f]{32}$/);
  assert.match(spanId ?? "", /^[0-9a-f]{16}$/);
});
