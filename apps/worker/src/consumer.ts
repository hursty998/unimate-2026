import { SpanStatusCode, type Span } from "@opentelemetry/api";
import { randomUUID } from "node:crypto";
import { jobEnvelopeSchema } from "@unimate/jobs";
import { PushProviderError } from "@unimate/notifications";
import {
  safeErrorType,
  type ErrorReporter,
  type ExecutionContextProvider,
  type StructuredLogger,
  type TelemetryProvider,
  type TracePropagationContext,
} from "@unimate/observability";
import type {
  JobQueue,
  QueueMessageId,
  ReceivedQueueMessage,
} from "@unimate/queue";
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
  logger: StructuredLogger,
): Promise<"dead-lettered" | "dead-letter-failed"> {
  try {
    if (await queue.deadLetter(messageId)) {
      return "dead-lettered";
    }
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: "Dead-letter failed; the message remains active.",
    });
    span.addEvent("exception", {
      "exception.type": safeErrorType(error),
    });
    logger.error("job.dead-letter.failed", {
      error_type: safeErrorType(error),
    });
    return "dead-letter-failed";
  }

  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: "Dead-letter failed; the message remains active.",
  });
  logger.error("job.dead-letter.failed", {
    error_type: "QueueMessageUnavailable",
  });
  return "dead-letter-failed";
}

export async function processQueueMessage({
  message,
  queue,
  telemetry,
  executionContext,
  logger,
  errorReporter,
  registry,
  maximumAttempts,
}: {
  readonly message: ReceivedQueueMessage;
  readonly queue: JobQueue;
  readonly telemetry: TelemetryProvider;
  readonly executionContext: ExecutionContextProvider;
  readonly logger: StructuredLogger;
  readonly errorReporter: ErrorReporter;
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

  const parsedEnvelope = jobEnvelopeSchema.safeParse(message.payload);
  const metadata = parsedEnvelope.success
    ? parsedEnvelope.data.observability
    : undefined;
  const propagationContext: TracePropagationContext | undefined =
    metadata?.traceparent
      ? {
          traceparent: metadata.traceparent,
          ...(metadata.tracestate ? { tracestate: metadata.tracestate } : {}),
        }
      : undefined;
  const correlationId = metadata?.correlationId ?? randomUUID();
  const context = {
    correlationId,
    ...(parsedEnvelope.success ? { jobId: parsedEnvelope.data.id } : {}),
    queueMessageId: message.id,
    deliveryCount: message.deliveryCount,
  };

  return executionContext.run(context, () =>
    telemetry.runWithPropagationContext(propagationContext, () =>
      telemetry.runInSpan({
        name: "job.process",
        root: propagationContext === undefined,
        attributes: {
          "unimate.correlation_id": correlationId,
          "queue.message_id": message.id,
          "queue.delivery_count": message.deliveryCount,
          ...(parsedEnvelope.success
            ? {
                "job.id": parsedEnvelope.data.id,
                "job.type": parsedEnvelope.data.type,
                "job.version": parsedEnvelope.data.version,
              }
            : {}),
        },
        async operation(span) {
          if (!parsedEnvelope.success) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: "Job envelope validation failed.",
            });
            logger.error("job.processing.failed", {
              error_type: "InvalidJobEnvelope",
              outcome: "dead-lettering",
            });
            return deadLetterAfterFailure(queue, message.id, span, logger);
          }

          const envelope = parsedEnvelope.data;
          span.updateName("job.process");

          let handler: RegisteredJobHandler;
          try {
            handler = registry.resolve(envelope.type, envelope.version);
          } catch (error) {
            if (!(error instanceof PermanentJobError)) {
              throw error;
            }

            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: "Job type/version is unsupported.",
            });
            logger.error("job.processing.failed", {
              error_type: safeErrorType(error),
              outcome: "dead-lettering",
            });
            return deadLetterAfterFailure(queue, message.id, span, logger);
          }

          try {
            await handler.handle({
              id: envelope.id,
              payload: envelope.payload,
            });
          } catch (error) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: "Job handler failed.",
            });
            if (!(error instanceof PermanentJobError)) {
              span.addEvent("exception", {
                "exception.type": safeErrorType(error),
              });
            }

            if (
              shouldDeadLetter(error, message.deliveryCount, maximumAttempts)
            ) {
              const outcome = await deadLetterAfterFailure(
                queue,
                message.id,
                span,
                logger,
              );
              logger.error("job.processing.failed", {
                error_type: safeErrorType(error),
                outcome,
              });

              if (
                outcome === "dead-lettered" &&
                !(error instanceof PermanentJobError) &&
                !(error instanceof PushProviderError)
              ) {
                try {
                  await errorReporter.captureException(error, {
                    operation: "job.process",
                    correlationId,
                    jobId: envelope.id,
                  });
                } catch (reportingError) {
                  logger.error("error.reporting.failed", {
                    error_type: safeErrorType(reportingError),
                    operation: "job.process",
                  });
                }
              }

              return outcome;
            }

            logger.error("job.processing.failed", {
              error_type: safeErrorType(error),
              outcome: "retrying",
            });
            return "retrying";
          }

          try {
            await queue.acknowledge(message.id);
            logger.info("job.processing.completed", {
              outcome: "acknowledged",
            });
            return "acknowledged";
          } catch (error) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: "Queue acknowledgement failed.",
            });
            span.addEvent("exception", {
              "exception.type": safeErrorType(error),
            });
            logger.error("job.processing.failed", {
              error_type: safeErrorType(error),
              failure_stage: "acknowledgement",
              outcome: "retrying",
            });
            return "retrying";
          }
        },
      }),
    ),
  );
}
