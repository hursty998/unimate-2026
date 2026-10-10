import { z } from "zod";
import {
  safeErrorType,
  type ExecutionContextProvider,
  type StructuredLogger,
  type TelemetryProvider,
  type TracePropagationContext,
} from "@unimate/observability";
import { jobEnvelopeSchema } from "@unimate/jobs";
import type { createDatabaseClient } from "@unimate/database";
import type { JobQueue, QueueMessageId } from "@unimate/queue";

type WorkerDatabase = ReturnType<typeof createDatabaseClient>;
type OutboxMessageRecord = Awaited<
  ReturnType<WorkerDatabase["outboxMessage"]["findUniqueOrThrow"]>
>;

export interface OutboxDispatcherTransaction {
  $queryRaw<T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
  outboxMessage: {
    findUniqueOrThrow(input: {
      where: { id: string };
    }): Promise<OutboxMessageRecord>;
    update(input: {
      where: { id: string };
      data: { publishedAt: Date };
    }): Promise<unknown>;
  };
}

export interface OutboxDispatcherDatabase {
  $transaction<T>(
    operation: (transaction: OutboxDispatcherTransaction) => Promise<T>,
    options: { maxWait: number; timeout: number },
  ): Promise<T>;
}

interface DispatchAttempt {
  readonly message: OutboxMessageRecord;
  readonly originatingContext?: TracePropagationContext;
  dispatchContext?: TracePropagationContext;
  queueMessageId?: QueueMessageId;
}

interface DispatchResult {
  readonly message: OutboxMessageRecord;
  readonly queueMessageId: QueueMessageId;
  readonly dispatchContext?: TracePropagationContext;
}

export async function dispatchOutboxBatch({
  database,
  queue,
  telemetry,
  executionContext,
  logger,
  limit,
}: {
  readonly database: OutboxDispatcherDatabase;
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
    let attempt: DispatchAttempt | undefined;
    let result: DispatchResult | null;

    try {
      result = await database.$transaction(
        async (transaction) => {
          // Prisma cannot express FOR UPDATE SKIP LOCKED for row claims.
          const [lockedRow] = await transaction.$queryRaw<
            Array<{ id: string }>
          >`
            SELECT id
            FROM app.outbox_messages
            WHERE published_at IS NULL
            ORDER BY created_at ASC, id ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          `;

          if (lockedRow === undefined) {
            return null;
          }

          const message = await transaction.outboxMessage.findUniqueOrThrow({
            where: { id: lockedRow.id },
          });
          const originatingContext = message.traceparent
            ? {
                traceparent: message.traceparent,
                ...(message.tracestate
                  ? { tracestate: message.tracestate }
                  : {}),
              }
            : undefined;
          attempt = {
            message,
            ...(originatingContext ? { originatingContext } : {}),
          };

          return executionContext.run(
            {
              correlationId: message.correlationId,
              jobId: message.id,
            },
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
                    const dispatchContext =
                      telemetry.capturePropagationContext();
                    if (dispatchContext && attempt) {
                      attempt.dispatchContext = dispatchContext;
                    }
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
                    const queueMessageId = await queue.enqueue(queuedPayload);
                    if (attempt) {
                      attempt.queueMessageId = queueMessageId;
                    }
                    span.setAttribute("queue.message_id", queueMessageId);

                    await transaction.outboxMessage.update({
                      where: { id: message.id },
                      data: { publishedAt: new Date() },
                    });

                    return {
                      message,
                      queueMessageId,
                      ...(dispatchContext ? { dispatchContext } : {}),
                    };
                  },
                }),
              ),
          );
        },
        { maxWait: 5_000, timeout: 10_000 },
      );
    } catch (error) {
      const logFailure = () =>
        logger.error("outbox.dispatch.failed", {
          ...(attempt
            ? {
                outbox_id: attempt.message.id,
                job_id: attempt.message.id,
                job_type: attempt.message.eventType,
                job_version: attempt.message.payloadVersion,
                ...(attempt.queueMessageId
                  ? { queue_message_id: attempt.queueMessageId }
                  : {}),
              }
            : {}),
          error_type: safeErrorType(error),
        });
      const logFailureWithContext = () =>
        attempt
          ? executionContext.run(
              {
                correlationId: attempt.message.correlationId,
                jobId: attempt.message.id,
              },
              logFailure,
            )
          : logFailure();

      await telemetry.runWithPropagationContext(
        attempt?.dispatchContext ?? attempt?.originatingContext,
        logFailureWithContext,
      );
      throw error;
    }

    if (result === null) {
      break;
    }

    const logCompletion = () =>
      executionContext.run(
        {
          correlationId: result.message.correlationId,
          jobId: result.message.id,
        },
        () =>
          logger.info("outbox.dispatch.completed", {
            outbox_id: result.message.id,
            job_id: result.message.id,
            job_type: result.message.eventType,
            job_version: result.message.payloadVersion,
            queue_message_id: result.queueMessageId,
          }),
      );
    await telemetry.runWithPropagationContext(
      result.dispatchContext,
      logCompletion,
    );
    dispatched += 1;
  }

  return dispatched;
}
