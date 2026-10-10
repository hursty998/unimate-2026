import { JobQueueError } from "@unimate/queue";
import { safeErrorType } from "@unimate/observability";
import { pathToFileURL } from "node:url";
import {
  createNodeObservabilityServices,
  startNodeObservabilityRuntime,
  type NodeObservabilityRuntime,
} from "@unimate/observability/node";
import { parseWorkerConfig } from "./config.js";
import { DeadLetterFailureError } from "./consumer.js";
import { createFoundationTaskHandler } from "./foundation-task-handler.js";
import {
  createFoundationPushReceiptCheckHandler,
  createFoundationPushSendHandler,
} from "./foundation-push-handlers.js";
import { dispatchOutboxBatch } from "./outbox-dispatcher.js";
import { createWorkerProviders } from "./providers/worker-providers.js";
import { PrismaPushDeliveryRepository } from "./push-delivery-repository.js";
import { createJobHandlerRegistry } from "./registry.js";
import {
  runWorkerContinuously,
  runWorkerCycle,
  type WorkerCycleFailure,
  type WorkerCycleResult,
} from "./runtime.js";

function parseArguments(arguments_: readonly string[]): { once: boolean } {
  if (arguments_.length === 0) {
    return { once: false };
  }

  if (arguments_.length === 1 && arguments_[0] === "--once") {
    return { once: true };
  }

  throw new TypeError("Worker accepts only the optional --once argument.");
}

function reportCycleFailure(
  { stage, cause }: WorkerCycleFailure,
  runtime: NodeObservabilityRuntime,
): void {
  if (stage === "outbox-dispatch") {
    runtime.logger.error("outbox.dispatch.failed", {
      error_type: safeErrorType(cause),
    });
  } else if (cause instanceof DeadLetterFailureError) {
    runtime.logger.error("job.dead-letter.failed", {
      error_type: cause.name,
    });
  } else if (cause instanceof JobQueueError) {
    runtime.logger.error("queue.consume.failed", {
      operation: cause.operation,
      failure_kind: cause.kind,
    });
  } else {
    runtime.logger.error("worker.cycle.failed", {
      stage,
      error_type: safeErrorType(cause),
    });
  }

  if (
    !(cause instanceof JobQueueError) &&
    !(cause instanceof DeadLetterFailureError)
  ) {
    void Promise.resolve(
      runtime.errorReporter.captureException(cause, {
        operation: `worker.cycle.${stage}`,
      }),
    ).catch((reportingError: unknown) => {
      runtime.logger.error("error.reporting.failed", {
        error_type: safeErrorType(reportingError),
        operation: `worker.cycle.${stage}`,
      });
    });
  }
}

function logCycleSummary(
  result: WorkerCycleResult,
  runtime: NodeObservabilityRuntime,
): void {
  if (result.dispatched === 0 && result.received === 0) {
    return;
  }

  runtime.logger.info("worker.cycle.completed", {
    dispatched: result.dispatched,
    received: result.received,
    acknowledged: result.acknowledged,
    retrying: result.retrying,
    dead_lettered: result.deadLettered,
    dead_letter_failures: result.deadLetterFailures,
  });
}

async function closeResources(
  database: { $disconnect(): Promise<void> } | undefined,
  queue: { close(): Promise<void> } | undefined,
  observability: NodeObservabilityRuntime,
): Promise<void> {
  const operations = [
    ...(queue ? [queue.close()] : []),
    ...(database ? [database.$disconnect()] : []),
    observability.shutdown(),
  ];
  const results = await Promise.allSettled(operations);
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      "Worker resources did not close cleanly.",
    );
  }
}

export async function main(
  arguments_: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const { once } = parseArguments(arguments_);
  const config = parseWorkerConfig(process.env);
  const observability = startNodeObservabilityRuntime({
    serviceName: "unimate-worker",
    config: config.observability,
  });
  let database:
    ReturnType<typeof createWorkerProviders>["database"] | undefined;
  let queue: ReturnType<typeof createWorkerProviders>["queue"] | undefined;
  const abortController = new AbortController();
  const onSignal = () => abortController.abort();

  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    const providers = createWorkerProviders(config, observability);
    database = providers.database;
    queue = providers.queue;
    const pushDeliveryRepository = new PrismaPushDeliveryRepository(database);
    const registry = createJobHandlerRegistry([
      createFoundationTaskHandler(database),
      createFoundationPushSendHandler({
        repository: pushDeliveryRepository,
        queue,
        pushProvider: providers.pushProvider,
        receiptCheckDelaySeconds: config.foundationPushReceiptCheckDelaySeconds,
      }),
      createFoundationPushReceiptCheckHandler({
        repository: pushDeliveryRepository,
        pushProvider: providers.pushProvider,
      }),
    ]);
    const dependencies = {
      dispatchOutbox: (limit: number) =>
        dispatchOutboxBatch({
          database: providers.database,
          queue: providers.queue,
          telemetry: providers.telemetry,
          executionContext: providers.executionContext,
          logger: providers.logger,
          limit,
        }),
      queue: providers.queue,
      telemetry: providers.telemetry,
      executionContext: providers.executionContext,
      logger: providers.logger,
      errorReporter: providers.errorReporter,
      registry,
      config,
    };

    observability.logger.info("process.started", { once });

    if (once) {
      const result = await runWorkerCycle(dependencies);
      logCycleSummary(result, observability);
      for (const failure of result.failures) {
        reportCycleFailure(failure, observability);
      }
      if (result.failures.length > 0 || result.deadLetterFailures > 0) {
        process.exitCode = 1;
      }
      return;
    }

    await runWorkerContinuously({
      config,
      signal: abortController.signal,
      async runCycle() {
        const result = await runWorkerCycle(dependencies);
        logCycleSummary(result, observability);
        return result;
      },
      onCycleFailure(failure) {
        reportCycleFailure(failure, observability);
      },
    });
  } catch (error) {
    observability.logger.error("process.failed", {
      error_type: safeErrorType(error),
    });
    try {
      await observability.errorReporter.captureException(error, {
        operation: "worker.process",
      });
    } catch (reportingError) {
      observability.logger.error("error.reporting.failed", {
        error_type: safeErrorType(reportingError),
        operation: "worker.process",
      });
    }
    process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    observability.logger.info("process.stopping");
    await closeResources(database, queue, observability);
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(async (error: unknown) => {
    const nodeEnvironment =
      process.env["NODE_ENV"] === "test" ||
      process.env["NODE_ENV"] === "production"
        ? process.env["NODE_ENV"]
        : "development";
    const fallback = createNodeObservabilityServices({
      serviceName: "unimate-worker",
      config: {
        environment: nodeEnvironment,
        logLevel: "error",
        traceExporter: "none",
        slowQueryThresholdMilliseconds: 250,
      },
    });
    fallback.logger.error("process.failed", {
      error_type: safeErrorType(error),
    });
    try {
      await fallback.errorReporter.captureException(error, {
        operation: "worker.startup",
      });
    } catch (reportingError) {
      fallback.logger.error("error.reporting.failed", {
        error_type: safeErrorType(reportingError),
        operation: "worker.startup",
      });
    }
    try {
      await fallback.logger.flush?.();
    } catch {
      process.exitCode = 1;
    }

    process.exitCode = 1;
  });
}
