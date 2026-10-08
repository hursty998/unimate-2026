import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSystemHealth } from "./use-system-health";

export function FoundationScreen() {
  const health = useSystemHealth();
  const status =
    health.fetchStatus === "paused" && health.isPending
      ? "waiting for network"
      : health.isPending
        ? "checking"
        : health.data
          ? "connected"
          : "unavailable";

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>UniMate</Text>
      <Text style={styles.body}>Foundation ready</Text>
      <Text style={styles.body}>Platform: {process.env.EXPO_OS}</Text>
      <Text style={styles.status}>API: {status}</Text>
      {health.data ? (
        <>
          <Text style={styles.body}>Service: {health.data.service}</Text>
          <Text style={styles.body}>API version: {health.data.apiVersion}</Text>
        </>
      ) : null}
      {health.isError ? (
        <>
          <Text style={styles.error}>
            {health.data
              ? "The latest API refresh failed."
              : health.error instanceof Error
                ? health.error.message
                : "The API request failed."}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: health.isFetching }}
            disabled={health.isFetching}
            onPress={() => void health.refetch()}
            style={styles.link}
          >
            <Text>Retry API connection</Text>
          </Pressable>
        </>
      ) : null}
      <Link href="/validation" asChild>
        <Pressable
          accessibilityHint="Opens the foundation validation route."
          accessibilityRole="link"
          style={styles.link}
        >
          <Text>Open validation route</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignSelf: "center",
    flex: 1,
    gap: 16,
    justifyContent: "center",
    maxWidth: 560,
    padding: 24,
    width: "100%",
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
  },
  body: {
    fontSize: 16,
  },
  status: {
    fontSize: 16,
    fontWeight: "600",
  },
  error: {
    color: "#9f1d1d",
    fontSize: 14,
  },
  link: {
    alignSelf: "flex-start",
    borderColor: "#767676",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
