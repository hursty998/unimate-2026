import { Platform } from "react-native";
import { validateCredentialEndpointUrl } from "../network/endpoint-url";

type MobilePlatform = typeof Platform.OS;

declare const __DEV__: boolean;

export function resolveApiBaseUrl(
  platform: MobilePlatform = Platform.OS,
  override: string | undefined = process.env.EXPO_PUBLIC_API_URL,
  development: boolean = __DEV__,
): string {
  const configuredUrl = override?.trim();

  if (configuredUrl) {
    return validateCredentialEndpointUrl(
      configuredUrl,
      "EXPO_PUBLIC_API_URL",
      development,
    );
  }

  if (!development) {
    throw new Error(
      "EXPO_PUBLIC_API_URL must be configured with HTTPS in production.",
    );
  }

  switch (platform) {
    case "web":
    case "ios":
      return "http://127.0.0.1:3000";
    case "android":
      return "http://10.0.2.2:3000";
    default:
      throw new Error(
        `No local API base URL is configured for platform "${platform}". Set EXPO_PUBLIC_API_URL.`,
      );
  }
}
