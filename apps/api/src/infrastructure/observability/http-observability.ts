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

export interface HttpRequestState {
  readonly context: ExecutionContext;
  readonly startedAt: number;
  readonly method: string;
  readonly route: string;
  span?: Span;
  finish?: () => void;
  errorType?: string;
  reported: boolean;
  exceptionRecorded: boolean;
  finalized: boolean;
  finished: boolean;
  advanced: boolean;
}

const quietRoutes = new Set(["/v1/system/health", "/v1/system/readiness"]);

export async function finalizeHttpRequest(
  state: HttpRequestState,
  reason: "response" | "aborted" | "timeout",
  {
    executionContext,
    telemetry,
    logger,
  }: {
    readonly executionContext: ExecutionContextProvider;
    readonly telemetry: TelemetryProvider;
    readonly logger: StructuredLogger;
  },
  completeResponse?: () => void | Promise<void>,
): Promise<boolean> {
  if (state.finalized) {
    finishRequestSpan(state);
    return false;
  }
  state.finalized = true;

  try {
    if (reason === "response") {
      await completeResponse?.();
    } else if (reason === "timeout") {
      state.errorType = "RequestTimeout";
      state.span?.setStatus({ code: SpanStatusCode.ERROR });
      state.span?.addEvent("exception", {
        "exception.type": state.errorType,
      });

      const logTimeout = () =>
        executionContext.run(state.context, () => {
          logger.warn("http.request.timed_out", {
            method: state.method,
            route: state.route,
            status: 408,
            duration_ms:
              Math.round((performance.now() - state.startedAt) * 100) / 100,
            error_type: state.errorType,
          });
        });
      if (state.span) {
        telemetry.runWithActiveSpan(state.span, logTimeout);
      } else {
        logTimeout();
      }
    }
  } finally {
    finishRequestSpan(state);
  }

  return true;
}

function finishRequestSpan(state: HttpRequestState): void {
  if (!state.finish || state.finished) return;
  state.finished = true;
  state.finish();
}

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
  const requests = new WeakMap<FastifyRequest, HttpRequestState>();

  fastify.addHook("onRequest", (request, reply, done) => {
    const requestId = randomUUID();
    const context: ExecutionContext = {
      requestId,
      correlationId: requestId,
    };
    const state: HttpRequestState = {
      context,
      startedAt: performance.now(),
      method: request.method,
      route: routeTemplate(request),
      reported: false,
      exceptionRecorded: false,
      finalized: false,
      finished: false,
      advanced: false,
    };
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
          "http.route": state.route,
          "unimate.request_id": requestId,
          "unimate.correlation_id": requestId,
        },
        operation(span) {
          state.span = span;
          return new Promise<void>((resolve) => {
            state.finish = resolve;
            if (state.finalized) {
              finishRequestSpan(state);
              return;
            }
            executionContext.run(context, () => {
              state.advanced = true;
              done();
            });
          });
        },
      })
      .catch((error: unknown) => {
        if (state.finalized) return;
        logger.error("http.request.instrumentation.failed", {
          error_type: safeErrorType(error),
        });
        if (!state.advanced) {
          done(new Error("Request instrumentation failed."));
        }
      });
  });

  fastify.addHook("onRequestAbort", async (request) => {
    const state = requests.get(request);
    if (!state) return;
    await finalizeHttpRequest(state, "aborted", {
      executionContext,
      telemetry,
      logger,
    });
  });

  fastify.addHook("onTimeout", async (request) => {
    const state = requests.get(request);
    if (!state) return;
    await finalizeHttpRequest(state, "timeout", {
      executionContext,
      telemetry,
      logger,
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
    if (!state || state.finalized) return;

    const route = routeTemplate(request);
    const durationMilliseconds =
      Math.round((performance.now() - state.startedAt) * 100) / 100;
    const statusCode = reply.statusCode;
    state.span?.updateName(`HTTP ${request.method} ${route}`);
    state.span?.setAttributes({
      "http.route": route,
      "http.response.status_code": statusCode,
    });
    await finalizeHttpRequest(
      state,
      "response",
      { executionContext, telemetry, logger },
      async () => {
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

        if (!quietRoutes.has(route)) {
          if (state.finished) return;
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
      },
    );
  });
}

function routeTemplate(request: FastifyRequest): string {
  const route = request.routeOptions.url?.split("?", 1)[0];
  return route || "unmatched";
}
