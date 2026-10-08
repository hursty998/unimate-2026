import type { Attributes, Span } from "@opentelemetry/api";

export interface TelemetryProvider {
  runInSpan<T>(input: {
    name: string;
    attributes?: Attributes;
    operation: (span: Span) => T | Promise<T>;
  }): Promise<T>;
}
