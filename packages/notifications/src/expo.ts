import {
  PushProviderError,
  type PushMessage,
  type PushProvider,
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

function isJsonValue(value: unknown): boolean {
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

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (isRecord(value)) {
    return Object.values(value).every(isJsonValue);
  }

  return false;
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

  async send(message: PushMessage): Promise<void> {
    if (
      message.destinationToken.trim().length === 0 ||
      message.title.trim().length === 0 ||
      message.body.trim().length === 0 ||
      (message.data !== undefined && !isJsonValue(message.data))
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
      return;
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
