import "@/lib/observability/sentry";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/lib/auth/auth-context";
import { NotificationResponseBridge } from "@/lib/notifications/notification-response-bridge";
import { notificationForegroundPresentationBehavior } from "@/lib/notifications/notification-presentation-policy";

if (process.env.EXPO_OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => notificationForegroundPresentationBehavior,
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="auto" />
          <NotificationResponseBridge />
          <Stack>
            <Stack.Screen name="index" options={{ title: "UniMate" }} />
            <Stack.Screen
              name="validation"
              options={{ title: "Foundation validation" }}
            />
          </Stack>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
