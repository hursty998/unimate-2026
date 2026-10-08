import {
  JobQueueError,
  type JsonValue,
  type QueueMessageId,
  type ReceivedQueueMessage,
} from "./index.js";
import { toJsonValue } from "./json-value.js";

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidQueueMessageId(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    return false;
  }

  return value.length <= 19 && BigInt(value) <= MAX_POSTGRES_BIGINT;
}

function invalidQueueRow(cause: unknown): JobQueueError {
  return new JobQueueError("rejected", "receive", {
    cause:
      cause instanceof Error
        ? cause
        : new TypeError("Supabase Queues returned an invalid message row."),
  });
}

export function parseQueueRow(value: unknown): ReceivedQueueMessage {
  if (!isRecord(value)) {
    throw invalidQueueRow(new TypeError("Queue row must be an object."));
  }

  const messageId = value["message_id"];
  if (!isValidQueueMessageId(messageId)) {
    throw invalidQueueRow(
      new TypeError("Queue row contained an invalid message identifier."),
    );
  }

  const deliveryCount = value["read_count"];
  if (
    typeof deliveryCount !== "number" ||
    !Number.isSafeInteger(deliveryCount) ||
    deliveryCount < 1
  ) {
    throw invalidQueueRow(
      new TypeError("Queue row contained an invalid delivery count."),
    );
  }

  let payload: JsonValue;

  try {
    payload = toJsonValue(value["message"]);
  } catch (cause) {
    throw invalidQueueRow(cause);
  }

  return {
    id: messageId as QueueMessageId,
    payload,
    deliveryCount,
  };
}
