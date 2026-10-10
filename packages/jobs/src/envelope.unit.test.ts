import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FOUNDATION_TASK_COMPLETION_JOB_TYPE,
  foundationTaskPayloadSchema,
  jobEnvelopeSchema,
} from "./index.js";

const validEnvelope = {
  id: "0199f4ad-6789-7abc-8def-0123456789ab",
  type: FOUNDATION_TASK_COMPLETION_JOB_TYPE,
  version: 1,
  payload: {
    taskId: "0199f4ad-6789-7abc-8def-1123456789ab",
  },
};

test("validates a strict, versioned job envelope and stable foundation payload", () => {
  assert.deepEqual(jobEnvelopeSchema.parse(validEnvelope), validEnvelope);
  assert.deepEqual(
    foundationTaskPayloadSchema.parse(validEnvelope.payload),
    validEnvelope.payload,
  );
});

test("accepts optional strict observability metadata and legacy envelopes", () => {
  const tracedEnvelope = {
    ...validEnvelope,
    observability: {
      correlationId: "0199f4ad-6789-7abc-8def-2123456789ab",
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      tracestate: "vendor=value",
    },
  };

  assert.deepEqual(jobEnvelopeSchema.parse(tracedEnvelope), tracedEnvelope);
  assert.deepEqual(jobEnvelopeSchema.parse(validEnvelope), validEnvelope);
  assert.equal(
    jobEnvelopeSchema.safeParse({
      ...tracedEnvelope,
      observability: {
        ...tracedEnvelope.observability,
        unexpected: true,
      },
    }).success,
    false,
  );
  assert.equal(
    jobEnvelopeSchema.safeParse({
      ...tracedEnvelope,
      observability: {
        correlationId: tracedEnvelope.observability.correlationId,
        traceparent: "not-w3c",
      },
    }).success,
    false,
  );
});

test("rejects malformed envelope fields and extra properties", () => {
  for (const input of [
    { ...validEnvelope, version: 0 },
    { ...validEnvelope, version: 1.5 },
    { ...validEnvelope, id: "not-a-uuid" },
    { ...validEnvelope, unexpected: true },
  ]) {
    assert.equal(jobEnvelopeSchema.safeParse(input).success, false);
  }

  assert.equal(
    foundationTaskPayloadSchema.safeParse({
      ...validEnvelope.payload,
      extra: "not allowed",
    }).success,
    false,
  );
});

test("keeps generic envelope validation separate from known job resolution", () => {
  assert.equal(
    jobEnvelopeSchema.safeParse({
      ...validEnvelope,
      type: "foundation.unsupported",
    }).success,
    true,
  );
  assert.equal(
    jobEnvelopeSchema.safeParse({
      ...validEnvelope,
      version: 2,
    }).success,
    true,
  );
});

test("rejects non-JSON payload values at the envelope boundary", () => {
  assert.equal(
    jobEnvelopeSchema.safeParse({
      ...validEnvelope,
      payload: Number.NaN,
    }).success,
    false,
  );
  assert.equal(
    jobEnvelopeSchema.safeParse({
      ...validEnvelope,
      payload: { taskId: validEnvelope.payload.taskId, extra: undefined },
    }).success,
    false,
  );
});
