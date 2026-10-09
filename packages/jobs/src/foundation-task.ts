import { z } from "zod";

export const FOUNDATION_TASK_COMPLETION_JOB_TYPE =
  "foundation.task.complete" as const;

export const foundationTaskPayloadSchema = z
  .object({
    taskId: z.uuid(),
  })
  .strict();

export type FoundationTaskPayload = z.infer<typeof foundationTaskPayloadSchema>;

export const FOUNDATION_PUSH_SEND_JOB_TYPE = "foundation.push.send" as const;

export const foundationPushSendPayloadSchema = z
  .object({
    registrationId: z.uuid(),
  })
  .strict();

export type FoundationPushSendPayload = z.infer<
  typeof foundationPushSendPayloadSchema
>;

export const FOUNDATION_PUSH_RECEIPT_CHECK_JOB_TYPE =
  "foundation.push.receipt.check" as const;

export const foundationPushReceiptCheckPayloadSchema = z
  .object({
    deliveryAttemptId: z.uuid(),
  })
  .strict();

export type FoundationPushReceiptCheckPayload = z.infer<
  typeof foundationPushReceiptCheckPayloadSchema
>;
