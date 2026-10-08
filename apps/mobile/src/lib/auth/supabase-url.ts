import { Platform } from "react-native";

type MobilePlatform = typeof Platform.OS;

function validateSupabaseUrl(value: string): string {
  const parsedUrl = new URL(value);

  if (
    (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search.length > 0 ||
    parsedUrl.hash.length > 0 ||
    parsedUrl.username.length > 0 ||
    parsedUrl.password.length > 0
  ) {
    throw new Error(
      "EXPO_PUBLIC_SUPABASE_URL must be an HTTP(S) origin without credentials, a path, query, or fragment.",
    );
  }

  return parsedUrl.origin;
}

export function resolveSupabaseUrl(
  platform: MobilePlatform = Platform.OS,
  override: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_URL,
): string {
  const configuredUrl = override?.trim();

  if (configuredUrl) {
    return validateSupabaseUrl(configuredUrl);
  }

  switch (platform) {
    case "web":
    case "ios":
      return "http://127.0.0.1:55321";
    case "android":
      return "http://10.0.2.2:55321";
    default:
      throw new Error(
        `No local Supabase URL is configured for platform "${platform}". Set EXPO_PUBLIC_SUPABASE_URL.`,
      );
  }
}
