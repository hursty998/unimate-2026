import type {
  ErrorContext,
  ErrorReporter,
  ExecutionContextProvider,
  StructuredLogger,
  StructuredLogFields,
} from "@unimate/observability";
import { AsyncExecutionContext } from "@unimate/observability/node";

export interface TestLog {
  readonly level: "debug" | "info" | "warn" | "error";
  readonly event: string;
  readonly fields?: StructuredLogFields;
}

export interface TestErrorReport {
  readonly error: unknown;
  readonly context?: ErrorContext;
}

export function createTestObservability(): {
  readonly executionContext: ExecutionContextProvider;
  readonly logger: StructuredLogger;
  readonly errorReporter: ErrorReporter;
  readonly logs: TestLog[];
  readonly reports: TestErrorReport[];
} {
  const logs: TestLog[] = [];
  const reports: TestErrorReport[] = [];
  const executionContext = new AsyncExecutionContext();
  const write = (
    level: TestLog["level"],
    event: string,
    fields?: StructuredLogFields,
  ) => {
    const current = executionContext.current();
    const enriched = {
      ...(fields ?? {}),
      ...(current?.requestId ? { request_id: current.requestId } : {}),
      ...(current ? { correlation_id: current.correlationId } : {}),
      ...(current?.jobId ? { job_id: current.jobId } : {}),
      ...(current?.queueMessageId
        ? { queue_message_id: current.queueMessageId }
        : {}),
      ...(current?.deliveryCount !== undefined
        ? { delivery_count: current.deliveryCount }
        : {}),
    };
    logs.push({ level, event, fields: enriched });
  };
  const logger: StructuredLogger = {
    debug: (event, fields) => write("debug", event, fields),
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
  };

  return {
    executionContext,
    logger,
    errorReporter: {
      captureException(error, context) {
        reports.push({ error, ...(context ? { context } : {}) });
      },
    },
    logs,
    reports,
  };
}
