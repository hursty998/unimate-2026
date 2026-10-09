import { z } from "zod";

export const FOUNDATION_TASK_COMPLETION_JOB_TYPE =
  "foundation.task.complete" as const;

export const foundationTaskPayloadSchema = z
  .object({
    taskId: z.uuid(),
  })
  .strict();

export type FoundationTaskPayload = z.infer<typeof foundationTaskPayloadSchema>;
