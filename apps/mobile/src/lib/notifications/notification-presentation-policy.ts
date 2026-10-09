import type { NotificationBehavior } from "expo-notifications";

export const notificationForegroundPresentationBehavior = {
  shouldShowBanner: true,
  shouldShowList: true,
  shouldPlaySound: false,
  shouldSetBadge: false,
} satisfies NotificationBehavior;
