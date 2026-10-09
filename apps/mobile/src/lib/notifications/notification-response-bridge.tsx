import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { router, useRootNavigationState } from "expo-router";
import { useAuth } from "@/lib/auth/auth-context";
import {
  dispatchNotificationNavigationIntent,
  parseNotificationNavigationIntent,
} from "./notification-navigation-intent";
import {
  createNotificationResponseCoordinator,
  isNotificationNavigationReady,
} from "./notification-response-coordinator";

function reportNotificationResponseError(error: unknown): void {
  console.error(
    "[notification-interaction] Could not process a notification response.",
    error,
  );
}

export function NotificationResponseBridge() {
  const { isLoading: isAuthLoading } = useAuth();
  const rootNavigationState = useRootNavigationState();
  const coordinatorRef = useRef<ReturnType<
    typeof createNotificationResponseCoordinator
  > | null>(null);
  const isReady = isNotificationNavigationReady({
    authBootstrapComplete: !isAuthLoading,
    routerReady: typeof rootNavigationState?.key === "string",
  });

  useEffect(() => {
    if (process.env.EXPO_OS === "web") {
      return;
    }

    const coordinator = createNotificationResponseCoordinator({
      parseIntent: parseNotificationNavigationIntent,
      navigate: (intent) =>
        dispatchNotificationNavigationIntent(intent, (href) =>
          router.push(href),
        ),
      clearLastNotificationResponse:
        Notifications.clearLastNotificationResponse,
    });
    coordinatorRef.current = coordinator;

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        void coordinator
          .handleResponse(response, "live")
          .catch(reportNotificationResponseError);
      },
    );

    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse !== null) {
      void coordinator
        .handleResponse(lastResponse, "cold-start")
        .catch(reportNotificationResponseError);
    }

    return () => {
      subscription.remove();
      if (coordinatorRef.current === coordinator) {
        coordinatorRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const coordinator = coordinatorRef.current;
    if (coordinator !== null) {
      void coordinator
        .setNavigationReady(isReady)
        .catch(reportNotificationResponseError);
    }
  }, [isReady]);

  return null;
}
