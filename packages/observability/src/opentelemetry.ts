import {
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
  type Tracer,
} from "@opentelemetry/api";
import type { TelemetryProvider } from "./index.js";

export class OpenTelemetryProvider implements TelemetryProvider {
  constructor(private readonly tracer: Tracer = trace.getTracer("unimate")) {}

  runInSpan<T>({
    name,
    attributes,
    operation,
  }: {
    name: string;
    attributes?: Attributes;
    operation: (span: Span) => T | Promise<T>;
  }): Promise<T> {
    const spanOptions = attributes === undefined ? {} : { attributes };

    return this.tracer.startActiveSpan(
      name,
      spanOptions,
      async (span): Promise<T> => {
        try {
          const result = await operation(span);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.recordException(error instanceof Error ? error : String(error));
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }
}
