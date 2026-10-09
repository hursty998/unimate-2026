import { createDatabaseClient } from "@unimate/database";
import { OpenTelemetryProvider } from "@unimate/observability/opentelemetry";
import { ExpoPushProvider } from "@unimate/notifications/expo";
import { SupabaseJobQueue } from "@unimate/queue/supabase";
import type { WorkerConfig } from "../config.js";

export function createWorkerProviders(config: WorkerConfig) {
  return {
    database: createDatabaseClient({
      connectionString: config.databaseUrl,
    }),
    queue: new SupabaseJobQueue({
      connectionString: config.queueDatabaseUrl,
      queueName: config.queueName,
    }),
    pushProvider: new ExpoPushProvider(),
    telemetry: new OpenTelemetryProvider(),
  };
}
