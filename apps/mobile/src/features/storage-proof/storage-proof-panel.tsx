import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getApiClient } from "@/lib/api/client";
import { resolveSupabaseUrl } from "@/lib/auth/supabase-url";
import { resolveStorageCapabilityUrl } from "@/lib/network/storage-capability-url";

declare const __DEV__: boolean;

const SYNTHETIC_PROOF_TEXT =
  "UniMate foundation proof: direct Storage upload and read.\n";

function bytesMatch(actual: ArrayBuffer, expected: Uint8Array): boolean {
  const bytes = new Uint8Array(actual);

  return (
    bytes.length === expected.length &&
    bytes.every((value, index) => value === expected[index])
  );
}

async function transferToStorage(
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error("Direct upload to Storage failed before a response.");
  }
}

async function readFromStorage(url: string): Promise<Response> {
  try {
    return await fetch(url);
  } catch {
    throw new Error("Direct read from Storage failed before a response.");
  }
}

function resolveCapabilityUrl(capabilityUrl: string): string {
  const platform = process.env.EXPO_OS;
  if (platform !== "android" && platform !== "ios" && platform !== "web") {
    throw new Error("The storage proof requires web, iOS, or Android.");
  }

  return resolveStorageCapabilityUrl(
    capabilityUrl,
    platform,
    resolveSupabaseUrl(platform),
    __DEV__,
  );
}

function isAndroidHostMappedStorageUrl(capabilityUrl: string): boolean {
  if (process.env.EXPO_OS !== "android" || !__DEV__) return false;

  const url = new URL(capabilityUrl);
  if (
    url.protocol !== "http:" ||
    !url.pathname.startsWith("/storage/v1/object/")
  ) {
    return false;
  }

  if (url.hostname !== "10.0.2.2" || url.port !== "55321") {
    throw new Error(
      "Android local Storage must use the host-mapped Supabase origin.",
    );
  }

  return true;
}

export function StorageProofPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function runProof(): Promise<void> {
    if (isRunning) return;

    setIsRunning(true);
    setSteps(["Requesting upload authorisation..."]);
    setError(null);
    let proofId: string | undefined;
    let api: ReturnType<typeof getApiClient> | undefined;

    try {
      api = getApiClient();
      const uploadPermission = await api.storageProof.issueUpload({});
      proofId = uploadPermission.id;
      setSteps((current) => [...current, "Upload authorisation received."]);
      const uploadUrl = resolveCapabilityUrl(uploadPermission.upload.url);
      if (isAndroidHostMappedStorageUrl(uploadUrl)) {
        setSteps((current) => [
          ...current,
          "Android host mapping active: 10.0.2.2:55321.",
        ]);
      }

      const uploadResponse = await transferToStorage(uploadUrl, {
        method: uploadPermission.upload.method,
        headers: uploadPermission.upload.headers,
        body: new Blob([SYNTHETIC_PROOF_TEXT], { type: "text/plain" }),
        redirect: "error",
      });
      if (!uploadResponse.ok) {
        throw new Error(
          `Direct upload to Storage failed (HTTP ${uploadResponse.status}).`,
        );
      }
      setSteps((current) => [...current, "Direct upload completed."]);

      await api.storageProof.completeUpload({ id: proofId });
      setSteps((current) => [...current, "Application completion recorded."]);

      const readPermission = await api.storageProof.readPermission({
        id: proofId,
      });
      setSteps((current) => [...current, "Read capability received."]);
      const readUrl = resolveCapabilityUrl(readPermission.url);
      isAndroidHostMappedStorageUrl(readUrl);

      const readResponse = await readFromStorage(readUrl);
      if (!readResponse.ok) {
        throw new Error(
          `Direct read from Storage failed (HTTP ${readResponse.status}).`,
        );
      }

      const expectedBytes = new TextEncoder().encode(SYNTHETIC_PROOF_TEXT);
      if (!bytesMatch(await readResponse.arrayBuffer(), expectedBytes)) {
        throw new Error("The downloaded proof bytes did not match.");
      }
      setSteps((current) => [...current, "Downloaded bytes matched."]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The storage proof failed. Please try again.",
      );
    } finally {
      if (proofId && api) {
        try {
          await api.storageProof.delete({ id: proofId });
          setSteps((current) => [...current, "Cleanup complete."]);
        } catch {
          setError((current) =>
            current
              ? `${current} Cleanup failed; the proof record may need attention.`
              : "Cleanup failed; the proof record may need attention.",
          );
        }
      }
      setIsRunning(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Foundation storage proof</Text>
      <Text style={styles.description}>
        Upload and read a small synthetic text file directly through private
        object storage.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isRunning }}
        disabled={isRunning}
        onPress={() => void runProof()}
        style={styles.button}
      >
        <Text>
          {isRunning ? "Running storage proof..." : "Run storage proof"}
        </Text>
      </Pressable>
      {steps.map((step) => (
        <Text key={step} style={styles.status}>
          {step}
        </Text>
      ))}
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
  button: {
    alignSelf: "flex-start",
    borderColor: "#767676",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  status: {
    fontSize: 14,
  },
  error: {
    color: "#9f1d1d",
    fontSize: 14,
  },
});
