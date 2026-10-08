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

export interface PushProvider {
  send(message: PushMessage): Promise<void>;
}
