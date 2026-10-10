export function getConfiguredSentryDsn(value?: string): string | undefined {
  const dsn = value?.trim();
  if (!dsn) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(dsn);
  } catch {
    throw new Error("EXPO_PUBLIC_SENTRY_DSN must be a valid Sentry DSN URL.");
  }

  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username.length === 0 ||
    parsed.password.length > 0 ||
    parsed.pathname.length < 2 ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new Error("EXPO_PUBLIC_SENTRY_DSN must be a valid Sentry DSN URL.");
  }

  return dsn;
}

export function redactSentryExceptionText(value: string): string {
  const supabaseCredentialPrefix = ["sb", ""].join("_");
  const postgresUrlPrefix = ["postgres", "(?:ql)?", "://"].join("");
  const supabaseCredentialPattern = new RegExp(
    `\\b${supabaseCredentialPrefix}[A-Za-z0-9_-]+`,
    "g",
  );
  const postgresUrlPattern = new RegExp(`${postgresUrlPrefix}\\S+`, "gi");

  return value
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/ExponentPushToken\[[^\]]+\]/g, "[REDACTED_PUSH_TOKEN]")
    .replace(/https?:\/\/[^\s?#]+\?[^\s#]*/gi, "[REDACTED_URL]")
    .replace(postgresUrlPattern, "[REDACTED_DATABASE_CONNECTION]")
    .replace(supabaseCredentialPattern, "[REDACTED]");
}
