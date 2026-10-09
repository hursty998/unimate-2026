import { SpanStatusCode } from "@opentelemetry/api";
import { jobEnvelopeSchema } from "@unimate/jobs";
import type { createDatabaseClient } from "@unimate/database";
import type { JobQueue } from "@unimate/queue";
import type { TelemetryProvider } from "@unimate/observability";

type WorkerDatabase = ReturnType<typeof createDatabaseClient>;

export async function dispatchOutboxBatch({
  database,
  queue,
  telemetry,
  limit,
}: {
  readonly database: WorkerDatabase;
  readonly queue: JobQueue;
  readonly telemetry: TelemetryProvider;
  readonly limit: number;
}): Promise<number> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("Outbox dispatch limit must be between 1 and 100.");
  }

  let dispatched = 0;

  while (dispatched < limit) {
    const attempt = await telemetry.runInSpan({
      name: "outbox.dispatch",
      async operation(span) {
        try {
          const published = await database.$transaction(
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
                return false;
              }

              const message = await transaction.outboxMessage.findUniqueOrThrow(
                { where: { id: lockedRow.id } },
              );
              const job = jobEnvelopeSchema.parse({
                id: message.id,
                type: message.eventType,
                version: message.payloadVersion,
                payload: message.payload,
              });

              span.setAttributes({
                "outbox.id": message.id,
                "job.id": job.id,
                "job.type": job.type,
                "job.version": job.version,
              });

              const queueMessageId = await queue.enqueue(job);
              span.setAttribute("queue.message_id", queueMessageId);

              await transaction.outboxMessage.update({
                where: { id: message.id },
                data: { publishedAt: new Date() },
              });

              return true;
            },
            { maxWait: 5_000, timeout: 10_000 },
          );

          return { published };
        } catch (error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: "Outbox dispatch failed.",
          });
          return { error };
        }
      },
    });

    if ("error" in attempt) {
      throw attempt.error;
    }

    if (!attempt.published) {
      break;
    }

    dispatched += 1;
  }

  return dispatched;
}
