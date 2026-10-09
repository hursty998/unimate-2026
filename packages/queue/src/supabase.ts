import pg from "pg";
import {
  JobQueueError,
  type JobQueue,
  type JsonValue,
  type QueueMessageId,
  type ReceivedQueueMessage,
} from "./index.js";
import { toJsonValue } from "./json-value.js";
import { isValidQueueMessageId, parseQueueRow } from "./queue-row.js";

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

function validateQueueName(value: string): void {
  if (!/^[a-z0-9_-]{1,48}$/.test(value)) {
    throw new TypeError(
      "Supabase queue names must use up to 48 lowercase letters, digits, underscores, or hyphens.",
    );
  }
}

function validateQueueMessageId(value: QueueMessageId): void {
  if (!isValidQueueMessageId(value)) {
    throw new TypeError("The queue message identifier is invalid.");
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
  operation: "enqueue" | "receive" | "acknowledge" | "dead-letter",
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

  async enqueue(
    payload: JsonValue,
    options: { readonly delaySeconds?: number } = {},
  ): Promise<QueueMessageId> {
    const delaySeconds = options.delaySeconds ?? 0;
    if (
      !Number.isSafeInteger(delaySeconds) ||
      delaySeconds < 0 ||
      delaySeconds > 2_147_483_647
    ) {
      throw new TypeError(
        "Queue delay must be a non-negative PostgreSQL integer.",
      );
    }

    const serialized = JSON.stringify(toJsonValue(payload));

    if (serialized === undefined) {
      throw new TypeError("Queue payload must be JSON serializable.");
    }

    try {
      const result = await this.pool.query<{ message_id: string }>(
        "select pgmq.send($1::text, $2::jsonb, $3::integer)::text as message_id",
        [this.options.queueName, serialized, delaySeconds],
      );
      const row = result.rows[0];

      if (row === undefined || !isValidQueueMessageId(row.message_id)) {
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
      const result = await this.pool.query(
        "select msg_id::text as message_id, read_ct as read_count, message from pgmq.read($1::text, $2::integer, $3::integer)",
        [this.options.queueName, visibilityTimeoutSeconds, limit],
      );

      return result.rows.map(parseQueueRow);
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
      const result = await this.pool.query<{ acknowledged: boolean }>(
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

  async deadLetter(messageId: QueueMessageId): Promise<boolean> {
    validateQueueMessageId(messageId);

    try {
      const result = await this.pool.query<{ dead_lettered: boolean }>(
        "select pgmq.archive($1::text, $2::bigint) as dead_lettered",
        [this.options.queueName, messageId],
      );
      const row = result.rows[0];

      if (row === undefined || typeof row.dead_lettered !== "boolean") {
        throw new JobQueueError(
          "rejected",
          "dead-letter",
          new Error("Supabase Queues returned an invalid dead-letter result."),
        );
      }

      return row.dead_lettered;
    } catch (cause) {
      if (cause instanceof JobQueueError) {
        throw cause;
      }

      throw mapQueueError("dead-letter", cause);
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
