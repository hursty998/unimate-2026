import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ title: "UniMate" }} />
        <Stack.Screen
          name="validation"
          options={{ title: "Foundation validation" }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
