export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type JobQueueFailureKind = "unavailable" | "rejected";

export class JobQueueError extends Error {
  constructor(
    readonly kind: JobQueueFailureKind,
    readonly operation: "enqueue" | "receive" | "acknowledge",
    options?: ErrorOptions,
  ) {
    super(`Queue ${operation} failed.`, options);
    this.name = "JobQueueError";
  }
}

declare const queueMessageIdBrand: unique symbol;

export type QueueMessageId = string & {
  readonly [queueMessageIdBrand]: "QueueMessageId";
};

export interface ReceivedQueueMessage {
  readonly id: QueueMessageId;
  readonly payload: JsonValue;
  readonly deliveryCount: number;
}

export interface JobQueue {
  enqueue(payload: JsonValue): Promise<QueueMessageId>;
  receive(options: {
    visibilityTimeoutSeconds: number;
    limit: number;
  }): Promise<readonly ReceivedQueueMessage[]>;
  acknowledge(messageId: QueueMessageId): Promise<boolean>;
}
