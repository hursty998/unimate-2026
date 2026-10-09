import type { NotificationNavigationIntent } from "./notification-navigation-intent";

export interface NotificationResponseLike {
  readonly actionIdentifier: string;
  readonly notification: {
    readonly request: {
      readonly identifier: string;
      readonly content: {
        readonly data?: unknown;
      };
    };
  };
}

export type NotificationResponseSource = "live" | "cold-start";

interface ResponseRecord {
  readonly intent: NotificationNavigationIntent | null;
  coldStart: boolean;
  dispatched: boolean;
  cleared: boolean;
  clearPromise: Promise<void> | null;
}

export interface NotificationResponseCoordinatorOptions {
  readonly parseIntent: (value: unknown) => NotificationNavigationIntent | null;
  readonly navigate: (intent: NotificationNavigationIntent) => boolean;
  readonly clearLastNotificationResponse: () => void | Promise<void>;
}

export function isNotificationNavigationReady({
  authBootstrapComplete,
  routerReady,
}: {
  readonly authBootstrapComplete: boolean;
  readonly routerReady: boolean;
}): boolean {
  return authBootstrapComplete && routerReady;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNavigationIntent(
  data: unknown,
  parseIntent: NotificationResponseCoordinatorOptions["parseIntent"],
): NotificationNavigationIntent | null {
  if (!isRecord(data)) {
    return null;
  }

  return parseIntent(data.navigation);
}

export function createNotificationResponseCoordinator({
  parseIntent,
  navigate,
  clearLastNotificationResponse,
}: NotificationResponseCoordinatorOptions) {
  const responses = new Map<string, ResponseRecord>();
  let navigationReady = false;

  async function clearResponse(record: ResponseRecord): Promise<void> {
    if (record.cleared) {
      return;
    }

    record.clearPromise ??= Promise.resolve().then(
      clearLastNotificationResponse,
    );

    try {
      await record.clearPromise;
      record.cleared = true;
    } catch (error) {
      record.clearPromise = null;
      throw error;
    }
  }

  async function consumeResponse(record: ResponseRecord): Promise<void> {
    if (record.intent === null) {
      if (record.coldStart) {
        await clearResponse(record);
      }
      return;
    }

    if (!record.dispatched) {
      if (!navigationReady || !navigate(record.intent)) {
        return;
      }
      record.dispatched = true;
    }

    await clearResponse(record);
  }

  async function handleResponse(
    response: NotificationResponseLike,
    source: NotificationResponseSource,
  ): Promise<void> {
    const key = JSON.stringify([
      response.notification.request.identifier,
      response.actionIdentifier,
    ]);
    let record = responses.get(key);

    if (record === undefined) {
      record = {
        intent: getNavigationIntent(
          response.notification.request.content.data,
          parseIntent,
        ),
        coldStart: false,
        dispatched: false,
        cleared: false,
        clearPromise: null,
      };
      responses.set(key, record);
    }

    if (source === "cold-start") {
      record.coldStart = true;
    }

    await consumeResponse(record);
  }

  async function setNavigationReady(ready: boolean): Promise<void> {
    navigationReady = ready;

    if (!ready) {
      return;
    }

    await Promise.all([...responses.values()].map(consumeResponse));
  }

  return { handleResponse, setNavigationReady };
}
