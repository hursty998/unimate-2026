import assert from "node:assert/strict";
import { SpanKind } from "@opentelemetry/api";
import {
  InMemorySpanExporter,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace-base";
import { test } from "node:test";
import type { NodeObservabilityConfig } from "./config.js";
import { startNodeObservabilityRuntime } from "./runtime.js";

const testConfig: NodeObservabilityConfig = {
  environment: "test",
  logLevel: "silent",
  traceExporter: "none",
  slowQueryThresholdMilliseconds: 250,
};

test("runs real spans with W3C propagation across request, dispatch, and job", async () => {
  const exporter = new InMemorySpanExporter();
  const runtime = startNodeObservabilityRuntime({
    serviceName: "unimate-test",
    config: testConfig,
    exporter,
  });
  const correlationId = "0199f4ad-6789-7abc-8def-0123456789ab";

  try {
    await runtime.executionContext.run(
      { requestId: correlationId, correlationId },
      () =>
        runtime.telemetry.runInSpan({
          name: "http.server",
          root: true,
          kind: SpanKind.SERVER,
          operation: async (requestSpan) => {
            requestSpan.setAttribute("unimate.correlation_id", correlationId);
            const requestContext =
              runtime.telemetry.capturePropagationContext();
            assert.ok(requestContext?.traceparent);

            await runtime.telemetry.runWithPropagationContext(
              requestContext,
              () =>
                runtime.telemetry.runInSpan({
                  name: "outbox.dispatch",
                  attributes: { "outbox.id": correlationId },
                  operation: async (dispatchSpan) => {
                    const jobContext =
                      runtime.telemetry.capturePropagationContext();
                    assert.ok(jobContext?.traceparent);
                    await runtime.telemetry.runWithPropagationContext(
                      jobContext,
                      () =>
                        runtime.telemetry.runInSpan({
                          name: "job.process",
                          attributes: { "job.id": correlationId },
                          operation() {},
                        }),
                    );
                    dispatchSpan.setAttribute(
                      "unimate.correlation_id",
                      correlationId,
                    );
                  },
                }),
            );
          },
        }),
    );
    await runtime.forceFlush();

    const spans = exporter.getFinishedSpans();
    const request = findSpan(spans, "http.server");
    const dispatch = findSpan(spans, "outbox.dispatch");
    const job = findSpan(spans, "job.process");

    assert.equal(dispatch.spanContext().traceId, request.spanContext().traceId);
    assert.equal(job.spanContext().traceId, request.spanContext().traceId);
    assert.equal(request.kind, SpanKind.SERVER);
    assert.equal(
      dispatch.parentSpanContext?.spanId,
      request.spanContext().spanId,
    );
    assert.equal(job.parentSpanContext?.spanId, dispatch.spanContext().spanId);
    assert.equal(dispatch.attributes["unimate.correlation_id"], correlationId);
  } finally {
    await runtime.shutdown();
  }
});

function findSpan(spans: readonly ReadableSpan[], name: string): ReadableSpan {
  const span = spans.find((candidate) => candidate.name === name);
  assert.ok(span, `Expected an exported ${name} span.`);
  return span;
}
