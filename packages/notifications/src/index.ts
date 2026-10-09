export type PushProviderFailureKind =
  "invalid-token" | "transient" | "rejected";

export class PushProviderError extends Error {
  readonly status: number | undefined;

  constructor(
    readonly kind: PushProviderFailureKind,
    message: string,
    options?: ErrorOptions & { status?: number },
  ) {
    super(message, options);
    this.name = "PushProviderError";
    this.status = options?.status;
  }
}

export type PushDataValue =
  | null
  | boolean
  | number
  | string
  | readonly PushDataValue[]
  | { readonly [key: string]: PushDataValue };

export interface PushMessage {
  readonly destinationToken: string;
  readonly title: string;
  readonly body: string;
  readonly data?: Readonly<Record<string, PushDataValue>>;
}

declare const pushSubmissionHandleBrand: unique symbol;

export type PushSubmissionHandle = string & {
  readonly [pushSubmissionHandleBrand]: "PushSubmissionHandle";
};

export interface PushSubmission {
  readonly handle: PushSubmissionHandle;
}

export type PushReceiptResult =
  { readonly status: "accepted" } | { readonly status: "pending" };

export interface PushProvider {
  send(message: PushMessage): Promise<PushSubmission>;
  checkReceipt(handle: PushSubmissionHandle): Promise<PushReceiptResult>;
}

export function parsePushSubmissionHandle(
  value: unknown,
): PushSubmissionHandle {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value !== value.trim()
  ) {
    throw new TypeError("Push submission handle must be a non-empty string.");
  }

  return value as PushSubmissionHandle;
}
