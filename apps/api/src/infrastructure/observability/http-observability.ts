import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { SpanKind, SpanStatusCode, type Span } from "@opentelemetry/api";
import {
  safeErrorType,
  type ErrorReporter,
  type ExecutionContext,
  type ExecutionContextProvider,
  type StructuredLogger,
  type TelemetryProvider,
} from "@unimate/observability";
import type { FastifyError, FastifyInstance, FastifyRequest } from "fastify";

interface RequestState {
  readonly context: ExecutionContext;
  readonly startedAt: number;
  span?: Span;
  finish?: () => void;
  errorType?: string;
  reported: boolean;
  exceptionRecorded: boolean;
  advanced: boolean;
}

const quietRoutes = new Set(["/v1/system/health", "/v1/system/readiness"]);

export function registerHttpObservability(
  fastify: FastifyInstance,
  {
    executionContext,
    telemetry,
    logger,
    errorReporter,
  }: {
    readonly executionContext: ExecutionContextProvider;
    readonly telemetry: TelemetryProvider;
    readonly logger: StructuredLogger;
    readonly errorReporter: ErrorReporter;
  },
): void {
  const requests = new WeakMap<FastifyRequest, RequestState>();

  fastify.addHook("onRequest", (request, reply, done) => {
    const requestId = randomUUID();
    const context: ExecutionContext = {
      requestId,
      correlationId: requestId,
    };
    const state: RequestState = {
      context,
      startedAt: performance.now(),
      reported: false,
      exceptionRecorded: false,
      advanced: false,
    };
    const route = routeTemplate(request);
    requests.set(request, state);
    reply.header("x-request-id", requestId);
    reply.header("x-correlation-id", requestId);

    void telemetry
      .runInSpan({
        name: "http.server",
        root: true,
        kind: SpanKind.SERVER,
        attributes: {
          "http.request.method": request.method,
          "http.route": route,
          "unimate.request_id": requestId,
          "unimate.correlation_id": requestId,
        },
        operation(span) {
          state.span = span;
          return new Promise<void>((resolve) => {
            state.finish = resolve;
            executionContext.run(context, () => {
              state.advanced = true;
              done();
            });
          });
        },
      })
      .catch((error: unknown) => {
        logger.error("http.request.instrumentation.failed", {
          error_type: safeErrorType(error),
        });
        if (!state.advanced) {
          done(new Error("Request instrumentation failed."));
        }
      });
  });

  fastify.addHook("onError", async (request, _reply, error: FastifyError) => {
    const state = requests.get(request);
    if (!state) return;

    state.errorType = safeErrorType(error);
    const statusCode = error.statusCode ?? 500;
    if (statusCode < 500) return;

    state.reported = true;
    state.span?.setStatus({ code: SpanStatusCode.ERROR });
    state.span?.addEvent("exception", {
      "exception.type": state.errorType,
    });
    state.exceptionRecorded = true;
    try {
      const report = () =>
        executionContext.run(state.context, () =>
          errorReporter.captureException(error, {
            operation: "http.request",
            ...(state.context.requestId
              ? { requestId: state.context.requestId }
              : {}),
            correlationId: state.context.correlationId,
          }),
        );
      if (state.span) {
        await telemetry.runWithActiveSpan(state.span, report);
      } else {
        await report();
      }
    } catch (reportingError) {
      logger.error("error.reporting.failed", {
        error_type: safeErrorType(reportingError),
        operation: "http.request",
      });
    }
  });

  fastify.addHook("onResponse", async (request, reply) => {
    const state = requests.get(request);
    if (!state) return;

    const route = routeTemplate(request);
    const durationMilliseconds =
      Math.round((performance.now() - state.startedAt) * 100) / 100;
    const statusCode = reply.statusCode;
    state.span?.updateName(`HTTP ${request.method} ${route}`);
    state.span?.setAttributes({
      "http.route": route,
      "http.response.status_code": statusCode,
    });
    if (statusCode >= 500) {
      state.span?.setStatus({ code: SpanStatusCode.ERROR });
      state.errorType ??= "Error";
      if (!state.exceptionRecorded) {
        state.span?.addEvent("exception", {
          "exception.type": state.errorType,
        });
        state.exceptionRecorded = true;
      }
      if (!state.reported) {
        state.reported = true;
        const report = () =>
          executionContext.run(state.context, () =>
            errorReporter.captureException(
              new Error("HTTP request failed unexpectedly."),
              {
                operation: "http.request",
                ...(state.context.requestId
                  ? { requestId: state.context.requestId }
                  : {}),
                correlationId: state.context.correlationId,
              },
            ),
          );
        try {
          if (state.span) {
            await telemetry.runWithActiveSpan(state.span, report);
          } else {
            await report();
          }
        } catch (reportingError) {
          logger.error("error.reporting.failed", {
            error_type: safeErrorType(reportingError),
            operation: "http.request",
          });
        }
      }
    }

    try {
      if (!quietRoutes.has(route)) {
        const logCompletion = () =>
          executionContext.run(state.context, () => {
            logger.info("http.request.completed", {
              method: request.method,
              route,
              status: statusCode,
              duration_ms: durationMilliseconds,
              ...(statusCode >= 500 && state.errorType
                ? { error_type: state.errorType }
                : {}),
            });
          });
        if (state.span) {
          telemetry.runWithActiveSpan(state.span, logCompletion);
        } else {
          logCompletion();
        }
      }
    } finally {
      state.finish?.();
    }
  });
}

function routeTemplate(request: FastifyRequest): string {
  const route = request.routeOptions.url?.split("?", 1)[0];
  return route || "unmatched";
}
