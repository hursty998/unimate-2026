import { createRemoteJWKSet, jwtVerify } from "jose";

export interface VerifiedIdentity {
  provider: "SUPABASE";
  providerSubject: string;
}

export interface AccessTokenVerifier {
  verify(token: string): Promise<VerifiedIdentity>;
}

export interface SupabaseAccessTokenVerifierOptions {
  supabaseUrl: string;
  audience?: string;
}

const SUPPORTED_ASYMMETRIC_ALGORITHMS = ["ES256", "RS256"] as const;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1"));
}

export function createSupabaseAccessTokenVerifier({
  supabaseUrl,
  audience = "authenticated",
}: SupabaseAccessTokenVerifierOptions): AccessTokenVerifier {
  const projectUrl = new URL(supabaseUrl);

  if (
    (projectUrl.protocol !== "http:" && projectUrl.protocol !== "https:") ||
    projectUrl.pathname !== "/" ||
    projectUrl.search.length > 0 ||
    projectUrl.hash.length > 0 ||
    projectUrl.username.length > 0 ||
    projectUrl.password.length > 0
  ) {
    throw new Error(
      "SUPABASE_URL must be an HTTP(S) origin without credentials, a path, query, or fragment.",
    );
  }

  if (
    projectUrl.protocol === "http:" &&
    !isLoopbackHostname(projectUrl.hostname)
  ) {
    throw new Error(
      "SUPABASE_URL must use HTTPS except for the local loopback Supabase stack.",
    );
  }

  if (audience.trim().length === 0) {
    throw new Error("The Supabase JWT audience must not be empty.");
  }

  const issuer = new URL("/auth/v1", projectUrl.origin).toString();
  const jwks = createRemoteJWKSet(
    new URL("/auth/v1/.well-known/jwks.json", projectUrl.origin),
    {
      cacheMaxAge: 10 * 60 * 1000,
      cooldownDuration: 30 * 1000,
      timeoutDuration: 5 * 1000,
    },
  );

  return {
    async verify(token) {
      const { payload } = await jwtVerify(token, jwks, {
        algorithms: [...SUPPORTED_ASYMMETRIC_ALGORITHMS],
        issuer,
        audience,
        requiredClaims: ["exp", "sub"],
      });

      if (typeof payload.sub !== "string" || payload.sub.trim().length === 0) {
        throw new Error("The verified Supabase access token has no subject.");
      }

      return {
        provider: "SUPABASE",
        providerSubject: payload.sub,
      };
    },
  };
}
