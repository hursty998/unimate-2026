type MobilePlatform = "android" | "ios" | "web";

const LOCAL_SUPABASE_PORT = "55321";

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
}

function isLoopbackHostname(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "::1"].includes(
    normalizeHostname(hostname),
  );
}

function isSignedStorageCapability(url: URL): boolean {
  return (
    url.protocol === "http:" &&
    url.port === LOCAL_SUPABASE_PORT &&
    isLoopbackHostname(url.hostname) &&
    (url.pathname.startsWith("/storage/v1/object/sign/") ||
      url.pathname.startsWith("/storage/v1/object/upload/sign/")) &&
    url.searchParams.has("token") &&
    url.hash.length === 0 &&
    url.username.length === 0 &&
    url.password.length === 0
  );
}

function isResolvedLocalOrigin(url: URL, platform: MobilePlatform): boolean {
  if (url.protocol !== "http:" || url.port !== LOCAL_SUPABASE_PORT) {
    return false;
  }

  if (platform === "android") {
    return normalizeHostname(url.hostname) === "10.0.2.2";
  }

  return isLoopbackHostname(url.hostname);
}

export function resolveStorageCapabilityUrl(
  capabilityUrl: string,
  platform: MobilePlatform,
  resolvedSupabaseOrigin: string,
  development: boolean,
): string {
  if (!development) {
    return capabilityUrl;
  }

  const signedUrl = new URL(capabilityUrl);
  if (!isSignedStorageCapability(signedUrl)) {
    return capabilityUrl;
  }

  const clientSupabaseUrl = new URL(resolvedSupabaseOrigin);
  if (
    clientSupabaseUrl.origin !== resolvedSupabaseOrigin ||
    !isResolvedLocalOrigin(clientSupabaseUrl, platform)
  ) {
    throw new Error(
      "A local Storage capability requires the platform's configured local Supabase origin on port 55321.",
    );
  }

  const protocolEnd = capabilityUrl.indexOf("://");
  const pathStart = capabilityUrl.indexOf("/", protocolEnd + 3);
  if (pathStart < 0) {
    throw new TypeError("The Storage capability URL has no object path.");
  }

  return `${clientSupabaseUrl.origin}${capabilityUrl.slice(pathStart)}`;
}
