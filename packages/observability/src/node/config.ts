import { z } from "zod";

const endpointSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);

      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        url.username.length === 0 &&
        url.password.length === 0 &&
        url.search.length === 0 &&
        url.hash.length === 0
      );
    } catch {
      return false;
    }
  }, "Expected an HTTP(S) OTLP endpoint without credentials or query parameters");

const optionalEndpointSchema = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined)
  .pipe(endpointSchema.optional());

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    OBSERVABILITY_LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .optional(),
    OBSERVABILITY_TRACE_EXPORTER: z
      .enum(["none", "console", "otlp"])
      .default("none"),
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: optionalEndpointSchema,
    DATABASE_SLOW_QUERY_THRESHOLD_MS: z.coerce
      .number()
      .int()
      .min(0)
      .max(60_000)
      .default(250),
  })
  .superRefine((environment, context) => {
    if (
      environment.OBSERVABILITY_TRACE_EXPORTER === "otlp" &&
      environment.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"],
        message:
          "An OTLP traces endpoint is required when OTLP export is enabled.",
      });
    }
  });

export interface NodeObservabilityConfig {
  readonly environment: "development" | "test" | "production";
  readonly logLevel:
    "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  readonly traceExporter: "none" | "console" | "otlp";
  readonly otlpTracesEndpoint?: string;
  readonly slowQueryThresholdMilliseconds: number;
}

export function parseNodeObservabilityConfig(
  environment: NodeJS.ProcessEnv = process.env,
): NodeObservabilityConfig {
  const parsed = environmentSchema.parse(environment);

  return {
    environment: parsed.NODE_ENV,
    logLevel:
      parsed.OBSERVABILITY_LOG_LEVEL ??
      (parsed.NODE_ENV === "test" ? "silent" : "info"),
    traceExporter: parsed.OBSERVABILITY_TRACE_EXPORTER,
    ...(parsed.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
      ? { otlpTracesEndpoint: parsed.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT }
      : {}),
    slowQueryThresholdMilliseconds: parsed.DATABASE_SLOW_QUERY_THRESHOLD_MS,
  };
}
