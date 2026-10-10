import { z } from "zod";
import {
  parseNodeObservabilityConfig,
  type NodeObservabilityConfig,
} from "@unimate/observability/node";

const postgresUrlSchema = z.string().superRefine((value, context) => {
  try {
    const url = new URL(value);

    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname.length === 0 ||
      url.pathname.length < 2 ||
      url.searchParams.has("host") ||
      url.searchParams.has("port")
    ) {
      context.addIssue({
        code: "custom",
        message: "must be a PostgreSQL connection URL",
      });
    }
  } catch {
    context.addIssue({
      code: "custom",
      message: "must be a PostgreSQL connection URL",
    });
  }
});

function integerSetting(
  fallback: number,
  minimum: number,
  maximum: number,
): z.ZodType<number> {
  return z.preprocess((value: unknown) => {
    if (value === undefined) {
      return fallback;
    }

    if (typeof value === "string" && /^\d+$/.test(value)) {
      return Number(value);
    }

    return value;
  }, z.number().int().min(minimum).max(maximum));
}

const workerEnvironmentSchema = z.object({
  DATABASE_URL: postgresUrlSchema,
  QUEUE_DATABASE_URL: postgresUrlSchema,
  QUEUE_NAME: z
    .string()
    .regex(/^[a-z0-9_-]{1,48}$/)
    .default("unimate_foundation_jobs"),
  QUEUE_VISIBILITY_TIMEOUT_SECONDS: integerSetting(30, 1, 2_147_483_647),
  WORKER_BATCH_SIZE: integerSetting(10, 1, 100),
  WORKER_MAX_DELIVERY_ATTEMPTS: integerSetting(5, 1, 100),
  WORKER_POLL_INTERVAL_MS: integerSetting(1_000, 10, 300_000),
  FOUNDATION_PUSH_RECEIPT_CHECK_DELAY_SECONDS: integerSetting(
    15 * 60,
    0,
    2_147_483_647,
  ),
});

export interface WorkerConfig {
  readonly databaseUrl: string;
  readonly queueDatabaseUrl: string;
  readonly queueName: string;
  readonly visibilityTimeoutSeconds: number;
  readonly batchSize: number;
  readonly maxDeliveryAttempts: number;
  readonly pollIntervalMilliseconds: number;
  readonly foundationPushReceiptCheckDelaySeconds: number;
  readonly observability: NodeObservabilityConfig;
}

export class WorkerConfigurationError extends Error {
  constructor(readonly invalidFields: readonly string[]) {
    super(`Invalid worker configuration: ${invalidFields.join(", ")}.`);
    this.name = "WorkerConfigurationError";
  }
}

export function parseWorkerConfig(
  environment: NodeJS.ProcessEnv,
): WorkerConfig {
  const result = workerEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    const invalidFields = [
      ...new Set(
        result.error.issues.map((issue) => String(issue.path[0] ?? "worker")),
      ),
    ];
    throw new WorkerConfigurationError(invalidFields);
  }

  return {
    databaseUrl: result.data.DATABASE_URL,
    queueDatabaseUrl: result.data.QUEUE_DATABASE_URL,
    queueName: result.data.QUEUE_NAME,
    visibilityTimeoutSeconds: result.data.QUEUE_VISIBILITY_TIMEOUT_SECONDS,
    batchSize: result.data.WORKER_BATCH_SIZE,
    maxDeliveryAttempts: result.data.WORKER_MAX_DELIVERY_ATTEMPTS,
    pollIntervalMilliseconds: result.data.WORKER_POLL_INTERVAL_MS,
    foundationPushReceiptCheckDelaySeconds:
      result.data.FOUNDATION_PUSH_RECEIPT_CHECK_DELAY_SECONDS,
    observability: parseNodeObservabilityConfig(environment),
  };
}
