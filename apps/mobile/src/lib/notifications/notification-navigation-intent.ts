export const foundationNotificationNavigationIntent = {
  v: 1,
  target: "foundation-validation",
} as const;

export type NotificationNavigationIntent =
  typeof foundationNotificationNavigationIntent;

export type NotificationNavigationHref = "/validation";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseNotificationNavigationIntent(
  value: unknown,
): NotificationNavigationIntent | null {
  if (!isRecord(value)) {
    return null;
  }

  const keys = Object.keys(value);
  if (
    keys.length !== 2 ||
    !keys.includes("v") ||
    !keys.includes("target") ||
    value.v !== 1 ||
    value.target !== "foundation-validation"
  ) {
    return null;
  }

  return foundationNotificationNavigationIntent;
}

export function dispatchNotificationNavigationIntent(
  intent: NotificationNavigationIntent,
  push: (href: NotificationNavigationHref) => void,
): boolean {
  switch (intent.target) {
    case "foundation-validation":
      push("/validation");
      return true;
    default:
      return false;
  }
}
