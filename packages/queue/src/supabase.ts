import pg, { type QueryResultRow } from "pg";
import {
  JobQueueError,
  type JobQueue,
  type JsonValue,
  type QueueMessageId,
  type ReceivedQueueMessage,
} from "./index.js";

const DEFAULT_TIMEOUT_MILLISECONDS = 5_000;
const TRANSIENT_POSTGRES_ERROR_CODES = new Set([
  "53300",
  "57P01",
  "57P02",
  "57P03",
  "40001",
  "40P01",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
]);

export interface SupabaseJobQueueOptions {
  connectionString: string;
  queueName: string;
  timeoutMilliseconds?: number;
}

interface QueueRow extends QueryResultRow {
  message_id: string;
  read_count: number;
  message: unknown;
}

interface QueueIdRow extends QueryResultRow {
  message_id: string;
}

interface AcknowledgementRow extends QueryResultRow {
  acknowledged: boolean;
}

function validateQueueName(value: string): void {
  if (!/^[a-z0-9_-]{1,55}$/.test(value)) {
    throw new TypeError(
      "Supabase queue names must use lowercase letters, digits, underscores, or hyphens.",
    );
  }
}

function validateQueueMessageId(value: QueueMessageId): void {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new TypeError("The queue message identifier is invalid.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonValue(
  value: unknown,
  ancestors = new WeakSet<object>(),
): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }

  if (typeof value !== "object" || ancestors.has(value)) {
    throw new TypeError("The queue message must be valid, acyclic JSON.");
  }

  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const result: JsonValue[] = [];

      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) {
          throw new TypeError(
            "The queue message must not contain array holes.",
          );
        }

        result.push(toJsonValue(value[index], ancestors));
      }

      return result;
    }

    if (
      !isRecord(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
    ) {
      throw new TypeError("The queue message must contain only JSON values.");
    }

    const result: Record<string, JsonValue> = {};

    for (const [key, entry] of Object.entries(value)) {
      result[key] = toJsonValue(entry, ancestors);
    }

    return result;
  } finally {
    ancestors.delete(value);
  }
}

function postgresErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return undefined;
}

function mapQueueError(
  operation: "enqueue" | "receive" | "acknowledge",
  cause: unknown,
): JobQueueError {
  const code = postgresErrorCode(cause);
  const isTransient =
    code === undefined ||
    code.startsWith("08") ||
    TRANSIENT_POSTGRES_ERROR_CODES.has(code);

  return new JobQueueError(
    isTransient ? "unavailable" : "rejected",
    operation,
    {
      cause,
    },
  );
}

function parsePayload(value: unknown): JsonValue {
  try {
    return toJsonValue(value);
  } catch (cause) {
    throw new JobQueueError("rejected", "receive", { cause });
  }
}

export class SupabaseJobQueue implements JobQueue {
  private readonly pool: pg.Pool;

  constructor(private readonly options: SupabaseJobQueueOptions) {
    validateQueueName(options.queueName);
    const timeoutMilliseconds =
      options.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS;

    if (!Number.isSafeInteger(timeoutMilliseconds) || timeoutMilliseconds < 1) {
      throw new TypeError("Queue request timeout must be a positive integer.");
    }

    this.pool = new pg.Pool({
      connectionString: options.connectionString,
      max: 2,
      connectionTimeoutMillis: timeoutMilliseconds,
      query_timeout: timeoutMilliseconds,
      statement_timeout: timeoutMilliseconds,
    });
  }

  async enqueue(payload: JsonValue): Promise<QueueMessageId> {
    const serialized = JSON.stringify(toJsonValue(payload));

    if (serialized === undefined) {
      throw new TypeError("Queue payload must be JSON serializable.");
    }

    try {
      const result = await this.pool.query<QueueIdRow>(
        "select pgmq.send($1::text, $2::jsonb)::text as message_id",
        [this.options.queueName, serialized],
      );
      const row = result.rows[0];

      if (row === undefined || !/^[1-9][0-9]*$/.test(row.message_id)) {
        throw new JobQueueError(
          "rejected",
          "enqueue",
          new Error("Supabase Queues returned an invalid message identifier."),
        );
      }

      return row.message_id as QueueMessageId;
    } catch (cause) {
      if (cause instanceof JobQueueError) {
        throw cause;
      }

      throw mapQueueError("enqueue", cause);
    }
  }

  async receive({
    visibilityTimeoutSeconds,
    limit,
  }: {
    visibilityTimeoutSeconds: number;
    limit: number;
  }): Promise<readonly ReceivedQueueMessage[]> {
    if (
      !Number.isSafeInteger(visibilityTimeoutSeconds) ||
      visibilityTimeoutSeconds < 0 ||
      visibilityTimeoutSeconds > 2_147_483_647
    ) {
      throw new TypeError(
        "Queue visibility timeout must be a non-negative PostgreSQL integer.",
      );
    }

    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new TypeError("Queue receive limit must be between 1 and 100.");
    }

    try {
      const result = await this.pool.query<QueueRow>(
        "select msg_id::text as message_id, read_ct as read_count, message from pgmq.read($1::text, $2::integer, $3::integer)",
        [this.options.queueName, visibilityTimeoutSeconds, limit],
      );

      return result.rows.map((row) => ({
        id: row.message_id as QueueMessageId,
        payload: parsePayload(row.message),
        deliveryCount: row.read_count,
      }));
    } catch (cause) {
      if (cause instanceof JobQueueError) {
        throw cause;
      }

      throw mapQueueError("receive", cause);
    }
  }

  async acknowledge(messageId: QueueMessageId): Promise<boolean> {
    validateQueueMessageId(messageId);

    try {
      const result = await this.pool.query<AcknowledgementRow>(
        "select pgmq.delete($1::text, $2::bigint) as acknowledged",
        [this.options.queueName, messageId],
      );
      const row = result.rows[0];

      if (row === undefined || typeof row.acknowledged !== "boolean") {
        throw new JobQueueError(
          "rejected",
          "acknowledge",
          new Error("Supabase Queues returned an invalid acknowledgement."),
        );
      }

      return row.acknowledged;
    } catch (cause) {
      if (cause instanceof JobQueueError) {
        throw cause;
      }

      throw mapQueueError("acknowledge", cause);
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
