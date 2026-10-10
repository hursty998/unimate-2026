import {
  SpanStatusCode,
  context,
  propagation,
  trace,
  type Attributes,
  type Span,
  type SpanKind,
  type Tracer,
} from "@opentelemetry/api";
import type { TelemetryProvider, TracePropagationContext } from "./index.js";

export class OpenTelemetryProvider implements TelemetryProvider {
  constructor(private readonly tracer: Tracer = trace.getTracer("unimate")) {}

  runInSpan<T>({
    name,
    attributes,
    root,
    kind,
    operation,
  }: {
    name: string;
    attributes?: Attributes;
    root?: boolean;
    kind?: SpanKind;
    operation: (span: Span) => T | Promise<T>;
  }): Promise<T> {
    const spanOptions = {
      ...(attributes === undefined ? {} : { attributes }),
      ...(root === undefined ? {} : { root }),
      ...(kind === undefined ? {} : { kind }),
    };

    return this.tracer.startActiveSpan(
      name,
      spanOptions,
      async (span): Promise<T> => {
        try {
          return await operation(span);
        } catch (error) {
          span.addEvent("exception", {
            "exception.type":
              error instanceof Error ? safeErrorType(error.name) : "Error",
          });
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  runWithActiveSpan<T>(span: Span, operation: () => T): T {
    return context.with(trace.setSpan(context.active(), span), operation);
  }

  capturePropagationContext(): TracePropagationContext | undefined {
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);
    const traceparent = carrier["traceparent"];

    if (!traceparent) {
      return undefined;
    }

    const tracestate = carrier["tracestate"];

    return {
      traceparent,
      ...(tracestate ? { tracestate } : {}),
    };
  }

  async runWithPropagationContext<T>(
    propagationContext: TracePropagationContext | undefined,
    operation: () => T | Promise<T>,
  ): Promise<T> {
    if (!propagationContext) {
      return operation();
    }

    const carrier = {
      traceparent: propagationContext.traceparent,
      ...(propagationContext.tracestate
        ? { tracestate: propagationContext.tracestate }
        : {}),
    };
    const extracted = propagation.extract(context.active(), carrier);

    return await context.with(extracted, operation);
  }
}

function safeErrorType(name: string): string {
  return /^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(name) ? name : "Error";
}
