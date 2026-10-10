import { createDatabaseClient } from "@unimate/database";
import {
  createNodeObservabilityServices,
  type NodeObservabilityServices,
} from "@unimate/observability/node";
import { ExpoPushProvider } from "@unimate/notifications/expo";
import { SupabaseJobQueue } from "@unimate/queue/supabase";
import type { WorkerConfig } from "../config.js";
import { ContextualJobQueue } from "../contextual-job-queue.js";

export function createWorkerProviders(
  config: WorkerConfig,
  observability: NodeObservabilityServices = createNodeObservabilityServices({
    serviceName: "unimate-worker",
    config: config.observability,
  }),
) {
  const rawQueue = new SupabaseJobQueue({
    connectionString: config.queueDatabaseUrl,
    queueName: config.queueName,
  });

  return {
    database: createDatabaseClient({
      connectionString: config.databaseUrl,
      slowQueryThresholdMilliseconds:
        config.observability.slowQueryThresholdMilliseconds,
      onSlowQuery(timing) {
        observability.logger.warn("database.query.slow", {
          ...(timing.model ? { model: timing.model } : {}),
          operation: timing.operation,
          duration_ms: timing.durationMilliseconds,
          threshold_ms: config.observability.slowQueryThresholdMilliseconds,
        });
      },
    }),
    queue: new ContextualJobQueue(
      rawQueue,
      observability.executionContext,
      observability.telemetry,
    ),
    pushProvider: new ExpoPushProvider(),
    ...observability,
  };
}
