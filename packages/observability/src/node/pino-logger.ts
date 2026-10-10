import pino, { type DestinationStream, type Logger as PinoLogger } from "pino";
import { context, trace } from "@opentelemetry/api";
import type {
  ExecutionContextProvider,
  StructuredLogger,
  StructuredLogFields,
} from "../index.js";

const redactedPaths = [
  "authorization",
  "Authorization",
  "headers",
  "req.headers",
  "request.headers",
  "request.header",
  "cookies",
  "cookie",
  "body",
  "requestBody",
  "responseBody",
  "payload",
  "jobPayload",
  "queuePayload",
  "url",
  "req.url",
  "request.url",
  "originalUrl",
  "signedUrl",
  "signed_url",
  "signedStorageUrl",
  "pushToken",
  "push_token",
  "providerToken",
  "provider_token",
  "expoPushToken",
  "expo_push_token",
  "databaseUrl",
  "database_url",
  "DATABASE_URL",
  "DIRECT_URL",
  "connectionString",
  "connection_string",
  "SUPABASE_SECRET_KEY",
  "supabaseSecretKey",
  "serviceRoleKey",
  "service_role_key",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "token",
  "password",
  "secret",
  "secretKey",
  "secret_key",
  "apiKey",
  "api_key",
  "err.message",
  "error.message",
  "headers.*",
  "req.headers.*",
  "request.headers.*",
  "request.header.*",
];

export interface StructuredLoggerOptions {
  readonly service: string;
  readonly environment: string;
  readonly level: pino.LevelWithSilent;
  readonly executionContext: ExecutionContextProvider;
  readonly destination?: DestinationStream;
}

export class PinoStructuredLogger implements StructuredLogger {
  private readonly logger: PinoLogger;

  constructor(
    private readonly executionContext: ExecutionContextProvider,
    {
      service,
      environment,
      level,
      destination,
    }: Omit<StructuredLoggerOptions, "executionContext">,
  ) {
    const options = {
      level,
      base: { service, environment },
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
      formatters: {
        level(label: string) {
          return { level: label };
        },
      },
      redact: { paths: redactedPaths, censor: "[REDACTED]" },
    };

    this.logger =
      destination === undefined ? pino(options) : pino(options, destination);
  }

  debug(event: string, fields?: StructuredLogFields): void {
    this.write("debug", event, fields);
  }

  info(event: string, fields?: StructuredLogFields): void {
    this.write("info", event, fields);
  }

  warn(event: string, fields?: StructuredLogFields): void {
    this.write("warn", event, fields);
  }

  error(event: string, fields?: StructuredLogFields): void {
    this.write("error", event, fields);
  }

  flush(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.flush((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private write(
    level: "debug" | "info" | "warn" | "error",
    event: string,
    fields?: StructuredLogFields,
  ): void {
    const execution = this.executionContext.current();
    const spanContext = trace.getSpan(context.active())?.spanContext();
    const bindings: Record<string, unknown> = { ...(fields ?? {}) };

    if (execution?.requestId) bindings["request_id"] = execution.requestId;
    if (execution?.correlationId)
      bindings["correlation_id"] = execution.correlationId;
    if (execution?.jobId) bindings["job_id"] = execution.jobId;
    if (execution?.queueMessageId)
      bindings["queue_message_id"] = execution.queueMessageId;
    if (execution?.deliveryCount !== undefined)
      bindings["delivery_count"] = execution.deliveryCount;
    if (
      spanContext?.traceId &&
      spanContext.traceId !== "00000000000000000000000000000000"
    )
      bindings["trace_id"] = spanContext.traceId;
    if (spanContext?.spanId && spanContext.spanId !== "0000000000000000")
      bindings["span_id"] = spanContext.spanId;

    this.logger[level]({ ...bindings, event });
  }
}
