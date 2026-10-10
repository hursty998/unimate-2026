import { randomUUID } from "node:crypto";
import type {
  ExecutionContextProvider,
  OutboxLineage,
  TelemetryProvider,
} from "../index.js";

export function captureOutboxLineage({
  executionContext,
  telemetry,
}: {
  readonly executionContext: ExecutionContextProvider;
  readonly telemetry: TelemetryProvider;
}): OutboxLineage {
  const correlationId =
    executionContext.current()?.correlationId ?? randomUUID();
  const propagationContext = telemetry.capturePropagationContext();

  return {
    correlationId,
    ...(propagationContext
      ? {
          traceparent: propagationContext.traceparent,
          ...(propagationContext.tracestate
            ? { tracestate: propagationContext.tracestate }
            : {}),
        }
      : {}),
  };
}
