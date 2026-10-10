import assert from "node:assert/strict";
import { test } from "node:test";
import { parseNodeObservabilityConfig } from "./config.js";

test("uses a silent test logger and no-export tracing by default", () => {
  assert.deepEqual(parseNodeObservabilityConfig({ NODE_ENV: "test" }), {
    environment: "test",
    logLevel: "silent",
    traceExporter: "none",
    slowQueryThresholdMilliseconds: 250,
  });
});

test("requires an explicit safe endpoint when OTLP export is enabled", () => {
  assert.throws(() =>
    parseNodeObservabilityConfig({
      OBSERVABILITY_TRACE_EXPORTER: "otlp",
    }),
  );
  assert.throws(() =>
    parseNodeObservabilityConfig({
      OBSERVABILITY_TRACE_EXPORTER: "otlp",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:
        "https://user:password@collector.example/v1/traces",
    }),
  );
  assert.throws(() =>
    parseNodeObservabilityConfig({
      OBSERVABILITY_TRACE_EXPORTER: "otlp",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:
        "https://collector.example/v1/traces?token=secret",
    }),
  );
});

test("validates the slow-query threshold and export mode", () => {
  assert.throws(() =>
    parseNodeObservabilityConfig({
      DATABASE_SLOW_QUERY_THRESHOLD_MS: "-1",
    }),
  );
  assert.throws(() =>
    parseNodeObservabilityConfig({
      OBSERVABILITY_TRACE_EXPORTER: "invalid",
    }),
  );
});
