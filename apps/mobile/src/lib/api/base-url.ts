import { Platform } from "react-native";

type MobilePlatform = typeof Platform.OS;

function validateApiUrl(value: string): string {
  const parsedUrl = new URL(value);

  if (
    (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search.length > 0 ||
    parsedUrl.hash.length > 0
  ) {
    throw new Error(
      "EXPO_PUBLIC_API_URL must be an HTTP(S) origin without a path, query, or fragment.",
    );
  }

  return parsedUrl.origin;
}

export function resolveApiBaseUrl(
  platform: MobilePlatform = Platform.OS,
  override: string | undefined = process.env.EXPO_PUBLIC_API_URL,
): string {
  const configuredUrl = override?.trim();

  if (configuredUrl) {
    return validateApiUrl(configuredUrl);
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
