import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getApiClient } from "@/lib/api/client";
import {
  registerPushDeviceFromAction,
  subscribeToPushTokenChanges,
} from "./push-registration";

type PermissionState = "not-requested" | "granted" | "denied" | "unsupported";

export function PushProofPanel() {
  const [permissionState, setPermissionState] =
    useState<PermissionState>("not-requested");
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [proofId, setProofId] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (registrationId === null) return;

    return subscribeToPushTokenChanges({
      onRegistrationId: setRegistrationId,
      onError: () => {
        setError(
          "The device push token changed, but the API could not update its registration.",
        );
      },
    });
  }, [registrationId]);

  async function enableAndRegister(): Promise<void> {
    if (isRegistering) return;

    setIsRegistering(true);
    setError(null);
    try {
      const result = await registerPushDeviceFromAction();
      if (result.status === "unsupported") {
        setPermissionState("unsupported");
        setRegistrationId(null);
        setError(
          result.reason === "web"
            ? "Push registration is available only on a physical iOS or Android device."
            : result.reason === "physical-device-required"
              ? "Remote push registration requires a physical device."
              : "Remote push notifications require the UniMate development build.",
        );
        return;
      }

      if (result.status === "permission-denied") {
        setPermissionState("denied");
        setRegistrationId(null);
        return;
      }

      setPermissionState("granted");
      setRegistrationId(result.registrationId);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not register this device for push notifications.",
      );
    } finally {
      setIsRegistering(false);
    }
  }

  async function sendProof(): Promise<void> {
    if (registrationId === null || isSending) return;

    setIsSending(true);
    setError(null);
    try {
      const result = await getApiClient().foundationPush.proof({
        registrationId,
      });
      setProofId(result.proofId);
    } catch {
      setError(
        "The push proof could not be queued. Check connectivity and retry.",
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Foundation push proof</Text>
      <Text style={styles.description}>
        Register this development device, then queue one harmless push.
      </Text>
      <Text style={styles.status}>
        Notification permission:{" "}
        {permissionState === "not-requested"
          ? "not requested"
          : permissionState}
      </Text>
      <Text style={styles.status}>
        Registration: {registrationId === null ? "not active" : "active"}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isRegistering }}
        disabled={isRegistering}
        onPress={() => void enableAndRegister()}
        style={styles.button}
      >
        <Text>
          {isRegistering ? "Registering push..." : "Enable/register push"}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{
          disabled: registrationId === null || isSending,
        }}
        disabled={registrationId === null || isSending}
        onPress={() => void sendProof()}
        style={styles.button}
      >
        <Text>{isSending ? "Queueing proof..." : "Send push proof"}</Text>
      </Pressable>
      {proofId ? (
        <Text style={styles.status}>Proof queued: {proofId}</Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderColor: "#767676",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  heading: {
    fontSize: 18,
    fontWeight: "600",
  },
  description: {
    fontSize: 14,
  },
  status: {
    fontSize: 14,
  },
  button: {
    alignSelf: "flex-start",
    borderColor: "#767676",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  error: {
    color: "#9f1d1d",
    fontSize: 14,
  },
});
