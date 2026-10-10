import {
  safeErrorType,
  type ErrorContext,
  type ErrorReporter,
  type StructuredLogger,
} from "../index.js";

export class StructuredErrorReporter implements ErrorReporter {
  constructor(private readonly logger: StructuredLogger) {}

  captureException(error: unknown, context?: ErrorContext): void {
    this.logger.error("error.exception.captured", {
      error_type: safeErrorType(error),
      ...(context ? { operation: safeOperation(context.operation) } : {}),
      ...(context?.requestId ? { request_id: context.requestId } : {}),
      ...(context?.correlationId
        ? { correlation_id: context.correlationId }
        : {}),
      ...(context?.jobId ? { job_id: context.jobId } : {}),
    });
  }
}

function safeOperation(operation: string): string {
  return /^[A-Za-z0-9._-]{1,80}$/.test(operation) ? operation : "unknown";
}
