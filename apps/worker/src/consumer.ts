import { SpanStatusCode, type Span } from "@opentelemetry/api";
import { jobEnvelopeSchema } from "@unimate/jobs";
import type {
  JobQueue,
  QueueMessageId,
  ReceivedQueueMessage,
} from "@unimate/queue";
import type { TelemetryProvider } from "@unimate/observability";
import { PermanentJobError } from "./permanent-job-error.js";
import type { JobHandlerRegistry, RegisteredJobHandler } from "./registry.js";

export type MessageProcessingOutcome =
  "acknowledged" | "retrying" | "dead-lettered" | "dead-letter-failed";

export class DeadLetterFailureError extends Error {
  constructor() {
    super("Queue dead-letter operation failed.");
    this.name = "DeadLetterFailureError";
  }
}

export function shouldDeadLetter(
  error: unknown,
  deliveryCount: number,
  maximumAttempts: number,
): boolean {
  return error instanceof PermanentJobError || deliveryCount >= maximumAttempts;
}

async function deadLetterAfterFailure(
  queue: JobQueue,
  messageId: QueueMessageId,
  span: Span,
): Promise<"dead-lettered" | "dead-letter-failed"> {
  try {
    if (await queue.deadLetter(messageId)) {
      return "dead-lettered";
    }
  } catch {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: "Dead-letter failed; the message remains active.",
    });
    return "dead-letter-failed";
  }

  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: "Dead-letter failed; the message remains active.",
  });
  return "dead-letter-failed";
}

export async function processQueueMessage({
  message,
  queue,
  telemetry,
  registry,
  maximumAttempts,
}: {
  readonly message: ReceivedQueueMessage;
  readonly queue: JobQueue;
  readonly telemetry: TelemetryProvider;
  readonly registry: JobHandlerRegistry;
  readonly maximumAttempts: number;
}): Promise<MessageProcessingOutcome> {
  if (
    !Number.isSafeInteger(maximumAttempts) ||
    maximumAttempts < 1 ||
    !Number.isSafeInteger(message.deliveryCount) ||
    message.deliveryCount < 1
  ) {
    throw new RangeError("Worker delivery-attempt settings are invalid.");
  }

  return telemetry.runInSpan({
    name: "job.process",
    attributes: {
      "queue.message_id": message.id,
      "queue.delivery_count": message.deliveryCount,
    },
    async operation(span) {
      const envelope = jobEnvelopeSchema.safeParse(message.payload);

      if (!envelope.success) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: "Job envelope validation failed.",
        });
        return deadLetterAfterFailure(queue, message.id, span);
      }

      span.setAttributes({
        "job.id": envelope.data.id,
        "job.type": envelope.data.type,
        "job.version": envelope.data.version,
      });

      let handler: RegisteredJobHandler;
      try {
        handler = registry.resolve(envelope.data.type, envelope.data.version);
      } catch (error) {
        if (!(error instanceof PermanentJobError)) {
          throw error;
        }

        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: "Job type/version is unsupported.",
        });
        return deadLetterAfterFailure(queue, message.id, span);
      }

      try {
        await handler.handle({
          id: envelope.data.id,
          payload: envelope.data.payload,
        });
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: "Job handler failed.",
        });

        if (shouldDeadLetter(error, message.deliveryCount, maximumAttempts)) {
          return deadLetterAfterFailure(queue, message.id, span);
        }

        return "retrying";
      }

      try {
        await queue.acknowledge(message.id);
        return "acknowledged";
      } catch {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: "Queue acknowledgement failed.",
        });
        return "retrying";
      }
    },
  });
}
