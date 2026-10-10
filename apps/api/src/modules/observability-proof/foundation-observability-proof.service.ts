import { Injectable } from "@nestjs/common";
import {
  FOUNDATION_TASK_COMPLETION_JOB_TYPE,
  foundationTaskPayloadSchema,
} from "@unimate/jobs";
import { DatabaseClientService } from "../../infrastructure/database/database.module.js";
import { OutboxLineageService } from "../../infrastructure/observability/observability.module.js";

@Injectable()
export class FoundationObservabilityProofService {
  constructor(
    private readonly database: DatabaseClientService,
    private readonly outboxLineage: OutboxLineageService,
  ) {}

  async queueProof(): Promise<{
    taskId: string;
    outboxId: string;
    jobId: string;
  }> {
    return this.database.client.$transaction(async (transaction) => {
      const task = await transaction.foundationAsyncTask.create({
        data: {},
        select: { id: true },
      });
      const outbox = await transaction.outboxMessage.create({
        data: {
          eventType: FOUNDATION_TASK_COMPLETION_JOB_TYPE,
          payloadVersion: 1,
          payload: foundationTaskPayloadSchema.parse({ taskId: task.id }),
          ...this.outboxLineage.capture(),
        },
        select: { id: true },
      });

      return { taskId: task.id, outboxId: outbox.id, jobId: outbox.id };
    });
  }
}
