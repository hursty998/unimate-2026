import {
  PushProviderError,
  type PushMessage,
  type PushProvider,
  type PushSubmission,
  type PushSubmissionHandle,
} from "./index.js";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const DEFAULT_TIMEOUT_MILLISECONDS = 10_000;

export interface ExpoPushProviderOptions {
  fetcher?: typeof fetch;
  timeoutMilliseconds?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(
  value: unknown,
  ancestors = new WeakSet<object>(),
): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "object" || ancestors.has(value)) {
    return false;
  }

  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        return false;
      }

      const ownKeys = Reflect.ownKeys(value);
      if (
        ownKeys.some(
          (key) =>
            typeof key !== "string" ||
            (key !== "length" &&
              (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)),
        )
      ) {
        return false;
      }

      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (
          descriptor === undefined ||
          !descriptor.enumerable ||
          !("value" in descriptor) ||
          !isJsonValue(descriptor.value, ancestors)
        ) {
          return false;
        }
      }

      return true;
    }

    if (
      !isRecord(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
    ) {
      return false;
    }

    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        return false;
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor) ||
        !isJsonValue(descriptor.value, ancestors)
      ) {
        return false;
      }
    }

    return true;
  } finally {
    ancestors.delete(value);
  }
}

export class ExpoPushProvider implements PushProvider {
  private readonly fetcher: typeof fetch;
  private readonly timeoutMilliseconds: number;

  constructor(options: ExpoPushProviderOptions = {}) {
    this.fetcher = options.fetcher ?? globalThis.fetch;
    this.timeoutMilliseconds =
      options.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS;

    if (
      !Number.isSafeInteger(this.timeoutMilliseconds) ||
      this.timeoutMilliseconds < 1
    ) {
      throw new TypeError("Push request timeout must be a positive integer.");
    }
  }

  async send(message: PushMessage): Promise<PushSubmission> {
    if (
      message.destinationToken.trim().length === 0 ||
      message.title.trim().length === 0 ||
      message.body.trim().length === 0 ||
      (message.data !== undefined &&
        (!isRecord(message.data) ||
          (Object.getPrototypeOf(message.data) !== Object.prototype &&
            Object.getPrototypeOf(message.data) !== null) ||
          !isJsonValue(message.data)))
    ) {
      throw new TypeError("Push message fields must contain valid values.");
    }

    const body = JSON.stringify({
      to: message.destinationToken,
      title: message.title,
      body: message.body,
      ...(message.data === undefined ? {} : { data: message.data }),
    });

    let response: Response;

    try {
      response = await this.fetcher(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMilliseconds),
      });
    } catch (cause) {
      throw new PushProviderError(
        "transient",
        "Expo Push could not complete the request.",
        { cause },
      );
    }

    if (!response.ok) {
      throw new PushProviderError(
        response.status === 429 || response.status >= 500
          ? "transient"
          : "rejected",
        "Expo Push rejected the request.",
        { status: response.status },
      );
    }

    let responseBody: unknown;

    try {
      responseBody = await response.json();
    } catch (cause) {
      throw new PushProviderError(
        "transient",
        "Expo Push returned an invalid response.",
        { cause },
      );
    }

    if (!isRecord(responseBody)) {
      throw new PushProviderError(
        "transient",
        "Expo Push returned an invalid response.",
      );
    }

    const data = responseBody["data"];
    const tickets = Array.isArray(data) ? data : [data];

    if (tickets.length !== 1 || !isRecord(tickets[0])) {
      throw new PushProviderError(
        "transient",
        "Expo Push returned an invalid ticket response.",
      );
    }

    const ticket = tickets[0];

    if (ticket["status"] === "ok") {
      const receiptId = ticket["id"];

      if (
        typeof receiptId !== "string" ||
        receiptId.trim().length === 0 ||
        receiptId !== receiptId.trim()
      ) {
        throw new PushProviderError(
          "transient",
          "Expo Push returned an invalid ticket response.",
        );
      }

      return { handle: receiptId as PushSubmissionHandle };
    }

    if (ticket["status"] !== "error") {
      throw new PushProviderError(
        "transient",
        "Expo Push returned an invalid ticket response.",
      );
    }

    const details = ticket["details"];
    const providerError = isRecord(details) ? details["error"] : undefined;

    if (providerError === "DeviceNotRegistered") {
      throw new PushProviderError(
        "invalid-token",
        "The push destination is no longer registered.",
      );
    }

    if (providerError === "MessageRateExceeded") {
      throw new PushProviderError(
        "transient",
        "Expo Push temporarily rate-limited the request.",
      );
    }

    throw new PushProviderError("rejected", "Expo Push rejected the message.");
  }
}
