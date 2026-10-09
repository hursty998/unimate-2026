import type { JobQueue, ReceivedQueueMessage } from "@unimate/queue";
import type { TelemetryProvider } from "@unimate/observability";
import { setTimeout as delay } from "node:timers/promises";
import type { WorkerConfig } from "./config.js";
import { DeadLetterFailureError, processQueueMessage } from "./consumer.js";
import type { JobHandlerRegistry } from "./registry.js";

export interface WorkerDependencies {
  readonly dispatchOutbox: (limit: number) => Promise<number>;
  readonly queue: JobQueue;
  readonly telemetry: TelemetryProvider;
  readonly registry: JobHandlerRegistry;
  readonly config: WorkerConfig;
}

export interface WorkerCycleFailure {
  readonly stage: "outbox-dispatch" | "queue-consume";
  readonly cause: unknown;
}

export interface WorkerCycleResult {
  readonly dispatched: number;
  readonly received: number;
  readonly acknowledged: number;
  readonly retrying: number;
  readonly deadLettered: number;
  readonly deadLetterFailures: number;
  readonly failures: readonly WorkerCycleFailure[];
}

export async function runWorkerCycle(
  dependencies: WorkerDependencies,
): Promise<WorkerCycleResult> {
  const { config, queue, telemetry, registry } = dependencies;
  const failures: WorkerCycleFailure[] = [];
  let dispatched = 0;
  try {
    dispatched = await dependencies.dispatchOutbox(config.batchSize);
  } catch (cause) {
    failures.push({ stage: "outbox-dispatch", cause });
  }
  const result = {
    dispatched,
    received: 0,
    acknowledged: 0,
    retrying: 0,
    deadLettered: 0,
    deadLetterFailures: 0,
    failures,
  };

  while (result.received < config.batchSize) {
    let message: ReceivedQueueMessage | undefined;
    try {
      [message] = await queue.receive({
        visibilityTimeoutSeconds: config.visibilityTimeoutSeconds,
        limit: 1,
      });
    } catch (cause) {
      failures.push({ stage: "queue-consume", cause });
      break;
    }

    if (message === undefined) {
      break;
    }

    result.received += 1;
    try {
      const outcome = await processQueueMessage({
        message,
        queue,
        telemetry,
        registry,
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
    } catch (cause) {
      failures.push({ stage: "queue-consume", cause });
      break;
    }
  }

  return result;
}

export async function runWorkerContinuously({
  config,
  signal,
  runCycle,
  onCycleFailure,
}: {
  readonly config: WorkerConfig;
  readonly signal: AbortSignal;
  readonly runCycle: () => Promise<WorkerCycleResult>;
  readonly onCycleFailure: (failure: WorkerCycleFailure) => void;
}): Promise<void> {
  while (!signal.aborted) {
    let result: WorkerCycleResult | undefined;
    try {
      result = await runCycle();
    } catch (error) {
      onCycleFailure({ stage: "queue-consume", cause: error });
    }

    if (signal.aborted) {
      break;
    }

    for (const failure of result?.failures ?? []) {
      onCycleFailure(failure);
    }

    if (
      result === undefined ||
      result.failures.length > 0 ||
      (result.dispatched === 0 && result.received === 0) ||
      result.deadLetterFailures > 0
    ) {
      if (result !== undefined && result.deadLetterFailures > 0) {
        onCycleFailure({
          stage: "queue-consume",
          cause: new DeadLetterFailureError(),
        });
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
