import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FOUNDATION_PUSH_RECEIPT_CHECK_JOB_TYPE,
  FOUNDATION_PUSH_SEND_JOB_TYPE,
  foundationPushReceiptCheckPayloadSchema,
  foundationPushSendPayloadSchema,
} from "./foundation-task.js";

const registrationId = "0199f4ad-6789-7abc-8def-0123456789ab";
const deliveryAttemptId = "0199f4ad-6789-7abc-8def-1123456789ab";

test("foundation push job v1 payloads are strict stable identifiers only", () => {
  assert.equal(FOUNDATION_PUSH_SEND_JOB_TYPE, "foundation.push.send");
  assert.equal(
    FOUNDATION_PUSH_RECEIPT_CHECK_JOB_TYPE,
    "foundation.push.receipt.check",
  );
  assert.deepEqual(foundationPushSendPayloadSchema.parse({ registrationId }), {
    registrationId,
  });
  assert.deepEqual(
    foundationPushReceiptCheckPayloadSchema.parse({ deliveryAttemptId }),
    { deliveryAttemptId },
  );

  assert.equal(
    foundationPushSendPayloadSchema.safeParse({
      registrationId,
      token: "must-not-be-in-a-job",
    }).success,
    false,
  );
  assert.equal(
    foundationPushReceiptCheckPayloadSchema.safeParse({
      deliveryAttemptId,
      receiptHandle: "must-not-be-in-a-job",
    }).success,
    false,
  );
});
