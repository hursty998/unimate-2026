import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { DestinationStream } from "pino";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  type SpanProcessor,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { NodeSDK } from "@opentelemetry/sdk-node";
import type {
  ExecutionContextProvider,
  ErrorReporter,
  StructuredLogger,
  TelemetryProvider,
} from "../index.js";
import { OpenTelemetryProvider } from "../opentelemetry.js";
import type { NodeObservabilityConfig } from "./config.js";
import { AsyncExecutionContext } from "./execution-context.js";
import { StructuredErrorReporter } from "./error-reporter.js";
import { PinoStructuredLogger } from "./pino-logger.js";

export interface NodeObservabilityServices {
  readonly logger: StructuredLogger;
  readonly errorReporter: ErrorReporter;
  readonly executionContext: ExecutionContextProvider;
  readonly telemetry: TelemetryProvider;
}

export interface NodeObservabilityRuntime extends NodeObservabilityServices {
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface StartNodeObservabilityOptions {
  readonly serviceName: string;
  readonly config: NodeObservabilityConfig;
  readonly exporter?: SpanExporter;
  readonly destination?: DestinationStream;
}

export function createNodeObservabilityServices({
  serviceName,
  config,
  destination,
  executionContext = new AsyncExecutionContext(),
}: StartNodeObservabilityOptions & {
  readonly executionContext?: ExecutionContextProvider;
}): NodeObservabilityServices {
  const logger = new PinoStructuredLogger(executionContext, {
    service: serviceName,
    environment: config.environment,
    level: config.logLevel,
    ...(destination ? { destination } : {}),
  });

  return {
    logger,
    errorReporter: new StructuredErrorReporter(logger),
    executionContext,
    telemetry: new OpenTelemetryProvider(),
  };
}

export function startNodeObservabilityRuntime({
  serviceName,
  config,
  exporter,
  destination,
}: StartNodeObservabilityOptions): NodeObservabilityRuntime {
  const traceExporter = exporter ?? createTraceExporter(config);
  const spanProcessor = traceExporter
    ? new BatchSpanProcessor(traceExporter)
    : new NoopSpanProcessor();
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "service.name": serviceName,
      "deployment.environment.name": config.environment,
    }),
    contextManager: new AsyncLocalStorageContextManager(),
    textMapPropagator: new W3CTraceContextPropagator(),
    spanProcessors: [spanProcessor],
    logRecordProcessors: [],
  });

  sdk.start();
  const services = createNodeObservabilityServices({
    serviceName,
    config,
    ...(destination === undefined ? {} : { destination }),
  });
  let shutdownPromise: Promise<void> | undefined;

  return {
    ...services,
    async forceFlush() {
      await spanProcessor?.forceFlush();
    },
    shutdown() {
      shutdownPromise ??= shutdownRuntime(sdk, services.logger);
      return shutdownPromise;
    },
  };
}

function createTraceExporter(
  config: NodeObservabilityConfig,
): SpanExporter | undefined {
  switch (config.traceExporter) {
    case "none":
      return undefined;
    case "console":
      return new ConsoleSpanExporter();
    case "otlp": {
      const endpoint = config.otlpTracesEndpoint;
      if (!endpoint) {
        throw new Error("OTLP trace export requires a configured endpoint.");
      }

      return new OTLPTraceExporter({
        url: endpoint,
        timeoutMillis: 3_000,
      });
    }
  }
}

class NoopSpanProcessor implements SpanProcessor {
  onStart(): void {}

  onEnd(): void {}

  async forceFlush(): Promise<void> {}

  async shutdown(): Promise<void> {}
}

async function shutdownRuntime(
  sdk: NodeSDK,
  logger: StructuredLogger,
): Promise<void> {
  const failures: unknown[] = [];

  try {
    await withTimeout(
      sdk.shutdown(),
      5_000,
      "OpenTelemetry shutdown timed out.",
    );
  } catch (error) {
    failures.push(error);
  }

  if (logger.flush) {
    try {
      await withTimeout(
        logger.flush(),
        1_000,
        "Structured logger flush timed out.",
      );
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      "Observability resources did not close.",
    );
  }
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMilliseconds: number,
  message: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(message)),
          timeoutMilliseconds,
        );
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
