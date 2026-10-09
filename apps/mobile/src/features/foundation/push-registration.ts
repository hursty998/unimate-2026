import Constants, { AppOwnership } from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { getApiClient } from "@/lib/api/client";

type NativePushPlatform = "ios" | "android";

export type PushRegistrationActionResult =
  | {
      readonly status: "unsupported";
      readonly reason:
        "web" | "physical-device-required" | "development-build-required";
    }
  | { readonly status: "permission-denied" }
  | { readonly status: "registered"; readonly registrationId: string };

function getNativePlatform(): NativePushPlatform | null {
  const platform = process.env.EXPO_OS;

  return platform === "ios" || platform === "android" ? platform : null;
}

function getProjectId(): string {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;

  if (typeof projectId !== "string" || projectId.length === 0) {
    throw new Error("The configured Expo project ID is unavailable.");
  }

  return projectId;
}

function hasNotificationPermission(
  permission: Notifications.NotificationPermissionsStatus,
): boolean {
  return (
    permission.granted ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

async function getExpoPushToken(
  devicePushToken?: Notifications.DevicePushToken,
): Promise<string> {
  let token: string;

  try {
    token = (
      await Notifications.getExpoPushTokenAsync({
        projectId: getProjectId(),
        ...(devicePushToken === undefined ? {} : { devicePushToken }),
      })
    ).data;
  } catch {
    throw new Error(
      "Could not obtain an Expo push token. Check network access and try again.",
    );
  }

  if (token.length === 0) {
    throw new Error("Expo did not return a push token.");
  }

  return token;
}

async function registerToken(
  token: string,
  platform: NativePushPlatform,
): Promise<string> {
  try {
    const registration = await getApiClient().pushRegistration.register({
      token,
      platform,
    });
    return registration.id;
  } catch {
    throw new Error(
      "The API could not register this device. Check connectivity and retry.",
    );
  }
}

export async function registerPushDeviceFromAction(): Promise<PushRegistrationActionResult> {
  const platform = getNativePlatform();

  if (platform === null) {
    return { status: "unsupported", reason: "web" };
  }

  if (!Device.isDevice) {
    return {
      status: "unsupported",
      reason: "physical-device-required",
    };
  }

  if (Constants.appOwnership === AppOwnership.Expo) {
    return {
      status: "unsupported",
      reason: "development-build-required",
    };
  }

  if (platform === "android") {
    await Notifications.setNotificationChannelAsync("foundation-proof", {
      name: "Foundation proof",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!hasNotificationPermission(permission)) {
    permission = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
  }

  if (!hasNotificationPermission(permission)) {
    return { status: "permission-denied" };
  }

  const token = await getExpoPushToken();
  const registrationId = await registerToken(token, platform);

  return { status: "registered", registrationId };
}

export function subscribeToPushTokenChanges({
  onRegistrationId,
  onError,
}: {
  readonly onRegistrationId: (registrationId: string) => void;
  readonly onError: () => void;
}): () => void {
  const platform = getNativePlatform();

  if (
    platform === null ||
    !Device.isDevice ||
    Constants.appOwnership === AppOwnership.Expo
  ) {
    return () => {};
  }

  const subscription = Notifications.addPushTokenListener((devicePushToken) => {
    void (async () => {
      try {
        const token = await getExpoPushToken(devicePushToken);
        const registrationId = await registerToken(token, platform);
        onRegistrationId(registrationId);
      } catch {
        onError();
      }
    })();
  });

  return () => subscription.remove();
}
