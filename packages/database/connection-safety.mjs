import { URL } from "node:url";

const postgresProtocols = new Set(["postgres:", "postgresql:"]);
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const defaultPostgresPort = 5432;

function parsePostgresUrl(value, variableName) {
  if (!value) {
    throw new Error(
      `${variableName} is required and must be a PostgreSQL URL.`,
    );
  }

  let url;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new Error(`${variableName} must be a valid PostgreSQL URL.`, {
      cause,
    });
  }

  if (!postgresProtocols.has(url.protocol)) {
    throw new Error(`${variableName} must use the PostgreSQL protocol.`);
  }

  return url;
}

function validateAppSchema(url, variableName) {
  const schemas = url.searchParams.getAll("schema");

  if (schemas.length !== 1 || schemas[0] !== "app") {
    throw new Error(
      `${variableName} must include exactly one schema=app query parameter.`,
    );
  }
}

function getDatabaseName(url, variableName) {
  try {
    const name = decodeURIComponent(url.pathname.slice(1));
    if (name.length === 0) {
      throw new Error("Database name is missing.");
    }
    return name;
  } catch (cause) {
    throw new Error(`${variableName} must include a valid database name.`, {
      cause,
    });
  }
}

function getEffectiveHostname(url, variableName) {
  const hostOverrides = url.searchParams.getAll("host");

  if (hostOverrides.length > 1) {
    throw new Error(`${variableName} must not contain multiple host values.`);
  }

  if (
    url.searchParams.has("hostaddr") ||
    url.searchParams.has("service") ||
    url.searchParams.has("servicefile")
  ) {
    throw new Error(
      `${variableName} must not use hostaddr or PostgreSQL service overrides for a local reset.`,
    );
  }

  return normalizeHostname(hostOverrides[0] || url.hostname);
}

function normalizeHostname(hostname) {
  return hostname
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "");
}

function getEffectivePort(url, variableName) {
  const portOverrides = url.searchParams.getAll("port");

  if (portOverrides.length > 1) {
    throw new Error(`${variableName} must not contain multiple port values.`);
  }

  const port = portOverrides[0] || url.port;
  if (!port) {
    return defaultPostgresPort;
  }

  const parsedPort = Number(port);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error(`${variableName} must use a valid PostgreSQL port.`);
  }

  return parsedPort;
}

function isLoopback(hostname) {
  return loopbackHosts.has(hostname);
}

function getEndpoint(url, variableName) {
  return {
    hostname: getEffectiveHostname(url, variableName),
    port: getEffectivePort(url, variableName),
    database: getDatabaseName(url, variableName),
  };
}

export function validateDirectUrl(value) {
  const url = parsePostgresUrl(value, "DIRECT_URL");
  validateAppSchema(url, "DIRECT_URL");
  return value;
}

export function validateLocalResetUrls(databaseUrl, directUrl) {
  const runtime = parsePostgresUrl(databaseUrl, "DATABASE_URL");
  const direct = parsePostgresUrl(directUrl, "DIRECT_URL");
  const runtimeEndpoint = getEndpoint(runtime, "DATABASE_URL");
  const directEndpoint = getEndpoint(direct, "DIRECT_URL");

  if (!isLoopback(runtimeEndpoint.hostname)) {
    throw new Error(
      "DATABASE_URL must target a loopback PostgreSQL host; refusing destructive reset.",
    );
  }

  if (!isLoopback(directEndpoint.hostname)) {
    throw new Error(
      "DIRECT_URL must target a loopback PostgreSQL host; refusing destructive reset.",
    );
  }

  validateAppSchema(direct, "DIRECT_URL");

  if (
    runtimeEndpoint.hostname !== directEndpoint.hostname ||
    runtimeEndpoint.port !== directEndpoint.port ||
    runtimeEndpoint.database !== directEndpoint.database
  ) {
    throw new Error(
      "DATABASE_URL and DIRECT_URL must target the same local PostgreSQL hostname, port, and database; refusing destructive reset.",
    );
  }
}
