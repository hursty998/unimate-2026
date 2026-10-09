import type { JobQueue } from "@unimate/queue";
import type { TelemetryProvider } from "@unimate/observability";
import { setTimeout as delay } from "node:timers/promises";
import type { WorkerConfig } from "./config.js";
import { DeadLetterFailureError, processQueueMessage } from "./consumer.js";
import { dispatchOutboxBatch } from "./outbox-dispatcher.js";
import type { RegisteredJobHandler } from "./registry.js";
import type { WorkerDatabase } from "./worker-types.js";

export interface WorkerDependencies {
  readonly database: WorkerDatabase;
  readonly queue: JobQueue;
  readonly telemetry: TelemetryProvider;
  readonly handlers: readonly RegisteredJobHandler[];
  readonly config: WorkerConfig;
}

export interface WorkerCycleResult {
  readonly dispatched: number;
  readonly received: number;
  readonly acknowledged: number;
  readonly retrying: number;
  readonly deadLettered: number;
  readonly deadLetterFailures: number;
}

export async function runWorkerCycle(
  dependencies: WorkerDependencies,
): Promise<WorkerCycleResult> {
  const { config, database, queue, telemetry, handlers } = dependencies;
  const dispatched = await dispatchOutboxBatch({
    database,
    queue,
    telemetry,
    limit: config.batchSize,
  });
  const messages = await queue.receive({
    visibilityTimeoutSeconds: config.visibilityTimeoutSeconds,
    limit: config.batchSize,
  });

  const result = {
    dispatched,
    received: messages.length,
    acknowledged: 0,
    retrying: 0,
    deadLettered: 0,
    deadLetterFailures: 0,
  };

  for (const message of messages) {
    const outcome = await processQueueMessage({
      message,
      queue,
      telemetry,
      handlers,
      maximumAttempts: config.maxDeliveryAttempts,
    });

    switch (outcome) {
      case "acknowledged":
        result.acknowledged += 1;
        break;
      case "retrying":
        result.retrying += 1;
        break;
      case "dead-lettered":
        result.deadLettered += 1;
        break;
      case "dead-letter-failed":
        result.deadLetterFailures += 1;
        break;
    }
  }

  return result;
}

export async function runWorkerContinuously({
  config,
  signal,
  runCycle,
  onCycleError,
}: {
  readonly config: WorkerConfig;
  readonly signal: AbortSignal;
  readonly runCycle: () => Promise<WorkerCycleResult>;
  readonly onCycleError: (error: unknown) => void;
}): Promise<void> {
  while (!signal.aborted) {
    let result: WorkerCycleResult | undefined;
    try {
      result = await runCycle();
    } catch (error) {
      onCycleError(error);
    }

    if (signal.aborted) {
      break;
    }

    if (
      result === undefined ||
      (result.dispatched === 0 && result.received === 0) ||
      result.deadLetterFailures > 0
    ) {
      if (result !== undefined && result.deadLetterFailures > 0) {
        onCycleError(new DeadLetterFailureError());
      }
      try {
        await delay(config.pollIntervalMilliseconds, undefined, {
          signal,
        });
      } catch (error) {
        if (!signal.aborted) {
          throw error;
        }
      }
    }
  }
}
