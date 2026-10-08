function normalizeHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "");
}

function isPrivateIpv4Address(hostname: string): boolean {
  const segments = hostname.split(".");

  if (
    segments.length !== 4 ||
    !segments.every((segment) => /^\d{1,3}$/.test(segment))
  ) {
    return false;
  }

  const octets = segments.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;

  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6Address(hostname: string): boolean {
  return (
    hostname === "::1" ||
    /^(?:fc|fd)[0-9a-f]{2}:/i.test(hostname) ||
    /^fe[89ab][0-9a-f]:/i.test(hostname)
  );
}

function isLocalDevelopmentHostname(hostname: string): boolean {
  const normalizedHostname = normalizeHostname(hostname);

  return (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname.endsWith(".local") ||
    normalizedHostname === "host.docker.internal" ||
    isPrivateIpv4Address(normalizedHostname) ||
    isPrivateIpv6Address(normalizedHostname)
  );
}

export function validateCredentialEndpointUrl(
  value: string,
  environmentVariable: string,
  development: boolean,
): string {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch (cause) {
    throw new Error(`${environmentVariable} must be a valid HTTP(S) origin.`, {
      cause,
    });
  }

  if (
    (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search.length > 0 ||
    parsedUrl.hash.length > 0 ||
    parsedUrl.username.length > 0 ||
    parsedUrl.password.length > 0
  ) {
    throw new Error(
      `${environmentVariable} must be an HTTP(S) origin without credentials, a path, query, or fragment.`,
    );
  }

  if (parsedUrl.protocol === "https:") {
    return parsedUrl.origin;
  }

  if (development && isLocalDevelopmentHostname(parsedUrl.hostname)) {
    return parsedUrl.origin;
  }

  throw new Error(
    `${environmentVariable} must use HTTPS; HTTP is allowed only for local development endpoints.`,
  );
}
