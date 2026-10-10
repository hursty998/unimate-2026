import type { Attributes, Span, SpanKind } from "@opentelemetry/api";

export type StructuredLogFields = Readonly<Record<string, unknown>>;

export interface StructuredLogger {
  debug(event: string, fields?: StructuredLogFields): void;
  info(event: string, fields?: StructuredLogFields): void;
  warn(event: string, fields?: StructuredLogFields): void;
  error(event: string, fields?: StructuredLogFields): void;
  flush?(): Promise<void>;
}

export interface ExecutionContext {
  readonly requestId?: string;
  readonly correlationId: string;
  readonly jobId?: string;
  readonly queueMessageId?: string;
  readonly deliveryCount?: number;
}

export interface ExecutionContextProvider {
  current(): ExecutionContext | undefined;
  run<T>(context: ExecutionContext, operation: () => T): T;
}

export interface ErrorContext {
  readonly operation: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly jobId?: string;
}

export interface ErrorReporter {
  captureException(
    error: unknown,
    context?: ErrorContext,
  ): void | Promise<void>;
}

export function safeErrorType(error: unknown): string {
  if (!(error instanceof Error)) {
    return "NonErrorThrown";
  }

  return /^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(error.name)
    ? error.name
    : "Error";
}

export interface TracePropagationContext {
  readonly traceparent: string;
  readonly tracestate?: string;
}

export interface OutboxLineage {
  readonly correlationId: string;
  readonly traceparent?: string;
  readonly tracestate?: string;
}

export interface TelemetryProvider {
  runInSpan<T>(input: {
    name: string;
    attributes?: Attributes;
    root?: boolean;
    kind?: SpanKind;
    operation: (span: Span) => T | Promise<T>;
  }): Promise<T>;
  runWithActiveSpan<T>(span: Span, operation: () => T): T;
  capturePropagationContext(): TracePropagationContext | undefined;
  runWithPropagationContext<T>(
    propagationContext: TracePropagationContext | undefined,
    operation: () => T | Promise<T>,
  ): Promise<T>;
}
