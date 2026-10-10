import { z } from "zod";
import {
  safeErrorType,
  type ExecutionContextProvider,
  type StructuredLogger,
  type TelemetryProvider,
} from "@unimate/observability";
import { jobEnvelopeSchema } from "@unimate/jobs";
import type { createDatabaseClient } from "@unimate/database";
import type { JobQueue } from "@unimate/queue";

type WorkerDatabase = ReturnType<typeof createDatabaseClient>;

export async function dispatchOutboxBatch({
  database,
  queue,
  telemetry,
  executionContext,
  logger,
  limit,
}: {
  readonly database: WorkerDatabase;
  readonly queue: JobQueue;
  readonly telemetry: TelemetryProvider;
  readonly executionContext: ExecutionContextProvider;
  readonly logger: StructuredLogger;
  readonly limit: number;
}): Promise<number> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("Outbox dispatch limit must be between 1 and 100.");
  }

  let dispatched = 0;

  while (dispatched < limit) {
    const published = await database.$transaction(
      async (transaction) => {
        // Prisma cannot express FOR UPDATE SKIP LOCKED for row claims.
        const [lockedRow] = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM app.outbox_messages
          WHERE published_at IS NULL
          ORDER BY created_at ASC, id ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `;

        if (lockedRow === undefined) {
          return false;
        }

        const message = await transaction.outboxMessage.findUniqueOrThrow({
          where: { id: lockedRow.id },
        });
        const originatingContext = message.traceparent
          ? {
              traceparent: message.traceparent,
              ...(message.tracestate ? { tracestate: message.tracestate } : {}),
            }
          : undefined;

        return executionContext.run(
          { correlationId: message.correlationId },
          () =>
            telemetry.runWithPropagationContext(originatingContext, () =>
              telemetry.runInSpan({
                name: "outbox.dispatch",
                attributes: {
                  "outbox.id": message.id,
                  "unimate.correlation_id": message.correlationId,
                  "job.id": message.id,
                  "job.type": message.eventType,
                  "job.version": message.payloadVersion,
                },
                async operation(span) {
                  const dispatchContext = telemetry.capturePropagationContext();
                  const job = jobEnvelopeSchema.parse({
                    id: message.id,
                    type: message.eventType,
                    version: message.payloadVersion,
                    payload: message.payload,
                    observability: {
                      correlationId: message.correlationId,
                      ...(dispatchContext
                        ? {
                            traceparent: dispatchContext.traceparent,
                            ...(dispatchContext.tracestate
                              ? { tracestate: dispatchContext.tracestate }
                              : {}),
                          }
                        : {}),
                    },
                  });
                  const queuedPayload = z.json().parse(job);

                  try {
                    const queueMessageId = await queue.enqueue(queuedPayload);
                    span.setAttribute("queue.message_id", queueMessageId);

                    await transaction.outboxMessage.update({
                      where: { id: message.id },
                      data: { publishedAt: new Date() },
                    });

                    logger.info("outbox.dispatch.completed", {
                      outbox_id: message.id,
                      job_id: job.id,
                      job_type: job.type,
                      job_version: job.version,
                      queue_message_id: queueMessageId,
                    });

                    return true;
                  } catch (error) {
                    logger.error("outbox.dispatch.failed", {
                      outbox_id: message.id,
                      job_id: job.id,
                      job_type: job.type,
                      error_type: safeErrorType(error),
                    });
                    throw error;
                  }
                },
              }),
            ),
        );
      },
      { maxWait: 5_000, timeout: 10_000 },
    );

    if (!published) {
      break;
    }

    dispatched += 1;
  }

  return dispatched;
}
