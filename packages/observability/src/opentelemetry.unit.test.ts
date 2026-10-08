import assert from "node:assert/strict";
import { SpanStatusCode } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { test } from "node:test";
import { OpenTelemetryProvider } from "./opentelemetry.js";

function createTelemetry() {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  return {
    exporter,
    provider,
    telemetry: new OpenTelemetryProvider(provider.getTracer("phase7-test")),
  };
}

test("records a successful span with provider-neutral attributes and status", async () => {
  const { exporter, provider, telemetry } = createTelemetry();
  const result = await telemetry.runInSpan({
    name: "foundation.operation",
    attributes: { "operation.kind": "test" },
    operation(span) {
      span.setAttribute("fixture", "synthetic");
      return "complete";
    },
  });
  await provider.forceFlush();

  const [span] = exporter.getFinishedSpans();
  assert.equal(result, "complete");
  assert.equal(span?.name, "foundation.operation");
  assert.equal(span?.attributes["operation.kind"], "test");
  assert.equal(span?.attributes["fixture"], "synthetic");
  assert.equal(span?.status.code, SpanStatusCode.UNSET);
});

test("preserves a span status explicitly set by the operation", async () => {
  const { exporter, provider, telemetry } = createTelemetry();

  await telemetry.runInSpan({
    name: "foundation.explicit-status",
    operation(span) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: "operation explicitly marked failure",
      });
    },
  });
  await provider.forceFlush();

  const [span] = exporter.getFinishedSpans();
  assert.equal(span?.status.code, SpanStatusCode.ERROR);
  assert.equal(span?.status.message, "operation explicitly marked failure");
});

test("records exceptions and error status while preserving the original failure", async () => {
  const { exporter, provider, telemetry } = createTelemetry();
  const failure = new Error("synthetic operation failure");

  await assert.rejects(
    telemetry.runInSpan({
      name: "foundation.failed-operation",
      operation() {
        throw failure;
      },
    }),
    failure,
  );
  await provider.forceFlush();

  const [span] = exporter.getFinishedSpans();
  assert.equal(span?.status.code, SpanStatusCode.ERROR);
  assert.equal(span?.events.length, 1);
  assert.equal(span?.events[0]?.name, "exception");
});
