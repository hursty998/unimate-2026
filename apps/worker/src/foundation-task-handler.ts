import { createDatabaseClient } from "@unimate/database";
import {
  FOUNDATION_TASK_COMPLETION_JOB_TYPE,
  foundationTaskPayloadSchema,
  type FoundationTaskPayload,
} from "@unimate/jobs";
import { PermanentJobError } from "./permanent-job-error.js";
import { registerJobHandler, type RegisteredJobHandler } from "./registry.js";

type WorkerDatabase = ReturnType<typeof createDatabaseClient>;

async function completeFoundationTask(
  database: WorkerDatabase,
  payload: FoundationTaskPayload,
): Promise<void> {
  const result = await database.foundationAsyncTask.updateMany({
    where: { id: payload.taskId, completedAt: null },
    data: { completedAt: new Date() },
  });

  if (result.count === 0) {
    const existingTask = await database.foundationAsyncTask.findUnique({
      where: { id: payload.taskId },
      select: { id: true },
    });

    if (existingTask === null) {
      throw new PermanentJobError(
        "The referenced foundation task does not exist.",
      );
    }
  }
}

export function createFoundationTaskHandler(
  database: WorkerDatabase,
): RegisteredJobHandler {
  return registerJobHandler({
    type: FOUNDATION_TASK_COMPLETION_JOB_TYPE,
    version: 1,
    payloadSchema: foundationTaskPayloadSchema,
    async handle({ payload }) {
      await completeFoundationTask(database, payload);
    },
  });
}
