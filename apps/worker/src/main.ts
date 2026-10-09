import { JobQueueError } from "@unimate/queue";
import { pathToFileURL } from "node:url";
import { parseWorkerConfig } from "./config.js";
import { DeadLetterFailureError } from "./consumer.js";
import { createFoundationTaskHandler } from "./foundation-task-handler.js";
import { dispatchOutboxBatch } from "./outbox-dispatcher.js";
import { createWorkerProviders } from "./providers/worker-providers.js";
import { createJobHandlerRegistry } from "./registry.js";
import {
  runWorkerContinuously,
  runWorkerCycle,
  type WorkerCycleFailure,
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

function reportCycleFailure({ stage, cause }: WorkerCycleFailure): void {
  if (stage === "outbox-dispatch") {
    const failureKind =
      cause instanceof Error ? cause.name : "unknown worker error";
    console.error(
      `Worker outbox dispatch failed (${failureKind}); queued work will still be consumed.`,
    );
    return;
  }

  if (cause instanceof DeadLetterFailureError) {
    console.error(
      "Worker could not dead-letter a message; it remains active for recovery.",
    );
    return;
  }

  if (cause instanceof JobQueueError) {
    console.error(`Worker queue ${cause.operation} failed (${cause.kind}).`);
    return;
  }

  const failureKind =
    cause instanceof Error ? cause.name : "unknown worker error";
  console.error(
    `Worker cycle failed (${failureKind}); retrying after the poll interval.`,
  );
}

async function closeResources(
  database: { $disconnect(): Promise<void> },
  queue: { close(): Promise<void> },
): Promise<void> {
  const results = await Promise.allSettled([
    queue.close(),
    database.$disconnect(),
  ]);
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
  const { database, queue, telemetry } = createWorkerProviders(config);
  const registry = createJobHandlerRegistry([
    createFoundationTaskHandler(database),
  ]);
  const dependencies = {
    dispatchOutbox: (limit: number) =>
      dispatchOutboxBatch({ database, queue, telemetry, limit }),
    queue,
    telemetry,
    registry,
    config,
  };
  const abortController = new AbortController();
  const onSignal = () => abortController.abort();

  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    if (once) {
      const result = await runWorkerCycle(dependencies);
      console.info(
        `Worker cycle complete: dispatched=${result.dispatched}, received=${result.received}, acknowledged=${result.acknowledged}, retrying=${result.retrying}, deadLettered=${result.deadLettered}, deadLetterFailures=${result.deadLetterFailures}.`,
      );
      for (const failure of result.failures) {
        reportCycleFailure(failure);
      }
      if (result.failures.length > 0 || result.deadLetterFailures > 0) {
        process.exitCode = 1;
      }
      return;
    }

    await runWorkerContinuously({
      config,
      signal: abortController.signal,
      runCycle: () => runWorkerCycle(dependencies),
      onCycleFailure: reportCycleFailure,
    });
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    await closeResources(database, queue);
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    if (error instanceof Error) {
      console.error(`${error.name}: ${error.message}`);
    } else {
      console.error("Worker failed with an unknown error.");
    }

    process.exitCode = 1;
  });
}
