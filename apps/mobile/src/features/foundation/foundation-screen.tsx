import { useState } from "react";
import { Link } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuthMe } from "@/features/auth/use-auth-me";
import { PushProofPanel } from "@/features/foundation/push-proof-panel";
import { shouldShowFoundationPushProof } from "@/features/foundation/push-proof-visibility";
import { shouldShowStorageProof } from "@/features/storage-proof/storage-proof-visibility";
import { useAuth } from "@/lib/auth/auth-context";
import { StorageProofPanel } from "@/features/storage-proof/storage-proof-panel";
import { useSystemHealth } from "./use-system-health";

declare const __DEV__: boolean;

export function FoundationScreen() {
  const auth = useAuth();
  const authMe = useAuthMe();
  const health = useSystemHealth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const status =
    health.fetchStatus === "paused" && health.isPending
      ? "waiting for network"
      : health.isPending
        ? "checking"
        : health.data
          ? "connected"
          : "unavailable";

  async function runAuthAction(action: () => Promise<void>): Promise<void> {
    setIsSubmitting(true);
    setAuthError(null);
    setAuthMessage(null);

    try {
      await action();
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : "Authentication request failed. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
    >
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
            style={styles.button}
          >
            <Text>Retry API connection</Text>
          </Pressable>
        </>
      ) : null}
      {auth.isLoading ? (
        <Text style={styles.status}>Auth: restoring session</Text>
      ) : auth.session ? (
        <View style={styles.authSection}>
          <Text style={styles.status}>Auth: signed in</Text>
          <Text style={styles.body}>
            API identity:{" "}
            {authMe.isPending
              ? "connecting"
              : authMe.data
                ? "connected"
                : "unavailable"}
          </Text>
          {authMe.data ? (
            <>
              <Text style={styles.body}>
                UniMate User ID: {authMe.data.user.id}
              </Text>
              <Text style={styles.body}>
                University affiliations:{" "}
                {authMe.data.universityAffiliations.length === 0
                  ? "0 (not affiliated)"
                  : authMe.data.universityAffiliations.length}
              </Text>
            </>
          ) : null}
          {authMe.isError ? (
            <>
              <Text style={styles.error}>The API identity request failed.</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: authMe.isFetching }}
                disabled={authMe.isFetching}
                onPress={() => void authMe.refetch()}
                style={styles.button}
              >
                <Text>Retry API identity</Text>
              </Pressable>
            </>
          ) : null}
          {shouldShowStorageProof(__DEV__, authMe.data !== undefined) ? (
            <StorageProofPanel />
          ) : null}
          {shouldShowFoundationPushProof(__DEV__, authMe.data !== undefined) ? (
            <PushProofPanel key={authMe.data?.user.id} />
          ) : null}
          {authError ? <Text style={styles.error}>{authError}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting }}
            disabled={isSubmitting}
            onPress={() => void runAuthAction(auth.signOut)}
            style={styles.button}
          >
            <Text>{isSubmitting ? "Signing out..." : "Sign out"}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.authSection}>
          <Text style={styles.status}>Auth: signed out</Text>
          <TextInput
            accessibilityLabel="Email address"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="Email"
            style={styles.input}
            textContentType="emailAddress"
            value={email}
          />
          <TextInput
            accessibilityLabel="Password"
            autoCapitalize="none"
            autoComplete="current-password"
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            style={styles.input}
            textContentType="password"
            value={password}
          />
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isSubmitting }}
              disabled={isSubmitting}
              onPress={() =>
                void runAuthAction(() => auth.signIn(email, password))
              }
              style={styles.button}
            >
              <Text>{isSubmitting ? "Signing in..." : "Sign in"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isSubmitting }}
              disabled={isSubmitting}
              onPress={() =>
                void runAuthAction(async () => {
                  const receivedSession = await auth.signUp(email, password);
                  if (!receivedSession) {
                    setAuthMessage(
                      "Account created. Confirm your email, then sign in.",
                    );
                  }
                })
              }
              style={styles.button}
            >
              <Text>{isSubmitting ? "Signing up..." : "Sign up"}</Text>
            </Pressable>
          </View>
          {authError ? <Text style={styles.error}>{authError}</Text> : null}
          {authMessage ? <Text style={styles.body}>{authMessage}</Text> : null}
        </View>
      )}
      <Link href="/validation" asChild>
        <Pressable
          accessibilityHint="Opens the foundation validation route."
          accessibilityRole="link"
          style={styles.link}
        >
          <Text>Open validation route</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignSelf: "center",
    gap: 16,
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
  authSection: {
    gap: 12,
  },
  input: {
    borderColor: "#767676",
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  button: {
    alignSelf: "flex-start",
    borderColor: "#767676",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
