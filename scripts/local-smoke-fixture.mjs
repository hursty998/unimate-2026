import { randomBytes, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdtemp,
  open,
  readFile,
  realpath,
  rmdir,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { URL, URLSearchParams } from "node:url";
import { validateLocalResetUrls } from "../packages/database/connection-safety.mjs";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const postgresProtocols = new Set(["postgres:", "postgresql:"]);
const fixtureDirectoryPrefix = "unimate-smoke-fixture-";
const credentialsFilename = "credentials.json";
const userIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseUrl(value, variableName) {
  if (typeof value !== "string") {
    throw new Error(`${variableName} is missing from local Supabase status.`);
  }

  try {
    return new URL(value);
  } catch {
    throw new Error(`${variableName} is invalid in local Supabase status.`);
  }
}

function postgresEndpoint(value, variableName) {
  const url = parseUrl(value, variableName);

  if (!postgresProtocols.has(url.protocol)) {
    throw new Error(`${variableName} is not a PostgreSQL URL.`);
  }

  const hostOverride = url.searchParams.get("host");
  const portOverride = url.searchParams.get("port");
  const hostname = (hostOverride || url.hostname)
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "");
  const port = Number(portOverride || url.port || "5432");

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${variableName} has an invalid PostgreSQL port.`);
  }

  return { hostname, port, database: url.pathname };
}

export function validateLocalSmokeTarget({
  supabaseStatus,
  databaseUrl,
  directUrl,
}) {
  validateLocalResetUrls(databaseUrl, directUrl);

  const apiUrl = parseUrl(supabaseStatus?.API_URL, "API_URL");
  if (
    apiUrl.protocol !== "http:" ||
    !loopbackHosts.has(apiUrl.hostname.toLowerCase()) ||
    apiUrl.username ||
    apiUrl.password ||
    (apiUrl.pathname !== "/" && apiUrl.pathname !== "")
  ) {
    throw new Error(
      "Smoke fixtures require the current local loopback Supabase API.",
    );
  }

  const statusDatabase = postgresEndpoint(supabaseStatus?.DB_URL, "DB_URL");
  if (!loopbackHosts.has(statusDatabase.hostname)) {
    throw new Error("Smoke fixtures require local loopback PostgreSQL.");
  }

  for (const [value, name] of [
    [databaseUrl, "DATABASE_URL"],
    [directUrl, "DIRECT_URL"],
  ]) {
    const endpoint = postgresEndpoint(value, name);
    if (
      !loopbackHosts.has(endpoint.hostname) ||
      endpoint.hostname !== statusDatabase.hostname ||
      endpoint.port !== statusDatabase.port ||
      endpoint.database !== statusDatabase.database
    ) {
      throw new Error(
        `${name} must match the current local Supabase PostgreSQL endpoint.`,
      );
    }
  }

  const publishableKey = supabaseStatus?.PUBLISHABLE_KEY;
  const secretKey = supabaseStatus?.SECRET_KEY;
  if (
    typeof publishableKey !== "string" ||
    !publishableKey.startsWith("sb_publishable_") ||
    typeof secretKey !== "string" ||
    !secretKey.startsWith("sb_secret_")
  ) {
    throw new Error(
      "Smoke fixtures require the current local Supabase publishable and secret keys.",
    );
  }

  return Object.freeze({
    supabaseUrl: apiUrl.origin,
    databaseUrl,
    directUrl,
    publishableKey,
    secretKey,
  });
}

export function readLocalSupabaseStatus() {
  const result = spawnSync("supabase", ["status", "-o", "json"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      "Local Supabase is unavailable. Start it with `pnpm db:start`, then retry.",
    );
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("Could not read local Supabase status JSON.");
  }
}

function authEndpoint(target, path) {
  return new URL(path, `${target.supabaseUrl}/`);
}

async function authRequest(target, path, options, fetchImpl) {
  try {
    return await fetchImpl(authEndpoint(target, path), {
      ...options,
      signal: globalThis.AbortSignal.timeout(15_000),
      headers: {
        apikey: target.secretKey,
        Authorization: `Bearer ${target.secretKey}`,
        ...(options?.body ? { "content-type": "application/json" } : {}),
        ...options?.headers,
      },
    });
  } catch {
    throw new Error("A local Supabase Auth fixture request failed.");
  }
}

async function findAuthUserByEmail(target, email, fetchImpl) {
  const query = new URLSearchParams({
    filter: email,
    page: "1",
    per_page: "100",
  });
  const response = await authRequest(
    target,
    `/auth/v1/admin/users?${query.toString()}`,
    { method: "GET" },
    fetchImpl,
  );

  if (!response.ok) {
    throw new Error(
      `Local Supabase Auth fixture recovery failed (HTTP ${response.status}).`,
    );
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "Local Supabase Auth fixture recovery returned invalid data.",
    );
  }

  if (!Array.isArray(result?.users)) {
    throw new Error(
      "Local Supabase Auth fixture recovery returned invalid data.",
    );
  }

  const matchingUser = result.users.find((user) => user?.email === email);
  if (!matchingUser || typeof matchingUser.id !== "string") {
    return null;
  }

  return matchingUser.id;
}

async function getAuthUserById(target, userId, fetchImpl) {
  const response = await authRequest(
    target,
    `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    { method: "GET" },
    fetchImpl,
  );

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(
      `Local Supabase Auth fixture verification failed (HTTP ${response.status}).`,
    );
  }

  let user;
  try {
    user = await response.json();
  } catch {
    throw new Error(
      "Local Supabase Auth fixture verification returned invalid data.",
    );
  }

  if (user?.id !== userId || typeof user.email !== "string") {
    throw new Error(
      "Local Supabase Auth fixture verification returned invalid data.",
    );
  }

  return user;
}

async function deleteAuthUser(target, userId, fetchImpl) {
  const response = await authRequest(
    target,
    `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
    fetchImpl,
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(
      `Local Supabase Auth fixture cleanup failed (HTTP ${response.status}).`,
    );
  }
}

export async function deleteUniMateIdentityIfPresent(
  database,
  providerSubject,
) {
  const identities = await database.client.authIdentity.findMany({
    where: { provider: "SUPABASE", providerSubject },
    select: { userId: true },
  });
  const userIds = [...new Set(identities.map(({ userId }) => userId))];

  if (userIds.length > 0) {
    await database.client.user.deleteMany({
      where: { id: { in: userIds } },
    });
  }
}

export async function createDatabaseIdentityCleaner(databaseUrl) {
  const { DatabaseClientService } =
    await import("../apps/api/dist/infrastructure/database/database.module.js");
  const database = new DatabaseClientService({ connectionString: databaseUrl });

  return async (providerSubject) => {
    try {
      await deleteUniMateIdentityIfPresent(database, providerSubject);
    } finally {
      await database.onModuleDestroy();
    }
  };
}

async function credentialsFileLocation(filePath) {
  if (typeof filePath !== "string" || !isAbsolute(filePath)) {
    throw new Error("Smoke credential file path must be absolute.");
  }

  const resolvedPath = resolve(filePath);
  const directory = dirname(resolvedPath);
  const tempRoot = await realpath(tmpdir());
  const realDirectory = await realpath(directory);
  const directoryRelativeToTemp = relative(tempRoot, realDirectory);

  if (
    directoryRelativeToTemp.startsWith("..") ||
    isAbsolute(directoryRelativeToTemp) ||
    dirname(realDirectory) !== tempRoot ||
    !basename(realDirectory).startsWith(fixtureDirectoryPrefix) ||
    basename(resolvedPath) !== credentialsFilename
  ) {
    throw new Error(
      "Smoke credential file is outside its private temporary directory.",
    );
  }

  const [realFile, fileInfo, directoryInfo] = await Promise.all([
    realpath(resolvedPath),
    lstat(resolvedPath),
    lstat(realDirectory),
  ]);

  if (
    realFile !== resolvedPath ||
    !fileInfo.isFile() ||
    !directoryInfo.isDirectory() ||
    (fileInfo.mode & 0o777) !== 0o600 ||
    (directoryInfo.mode & 0o777) !== 0o700
  ) {
    throw new Error(
      "Smoke credential file permissions or location are unsafe.",
    );
  }

  return { path: resolvedPath, directory: realDirectory };
}

export async function writeSmokeCredentialsFile(fixture) {
  const tempRoot = await realpath(tmpdir());
  const directory = await mkdtemp(`${tempRoot}/${fixtureDirectoryPrefix}`);
  const filePath = `${directory}/${credentialsFilename}`;

  try {
    await chmod(directory, 0o700);
    const file = await open(filePath, "wx", 0o600);
    try {
      await file.writeFile(
        JSON.stringify({
          email: fixture.email,
          password: fixture.password,
          ...(fixture.userId ? { userId: fixture.userId } : {}),
        }),
        { encoding: "utf8" },
      );
      await file.sync();
    } finally {
      await file.close();
    }
    await chmod(filePath, 0o600);
    await credentialsFileLocation(filePath);
    return filePath;
  } catch {
    const cleanupErrors = [];
    try {
      await unlink(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        cleanupErrors.push(
          new Error("Could not remove the partial credential file."),
        );
      }
    }
    try {
      await rmdir(directory);
    } catch (error) {
      if (error.code !== "ENOENT") {
        cleanupErrors.push(
          new Error("Could not remove the private credential directory."),
        );
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        "Could not safely clean up partial local smoke credentials.",
      );
    }
    throw new Error("Could not write private local smoke credentials.");
  }
}

export async function readSmokeCredentialsFile(filePath) {
  const location = await credentialsFileLocation(filePath);
  let credentials;
  try {
    credentials = JSON.parse(await readFile(location.path, "utf8"));
  } catch {
    throw new Error("Could not read private local smoke credentials.");
  }

  const keys = Object.keys(credentials ?? {}).sort();
  const hasValidKeySet =
    keys.join(",") === "email,password" ||
    keys.join(",") === "email,password,userId";
  if (
    !hasValidKeySet ||
    (credentials.userId !== undefined &&
      !userIdPattern.test(credentials.userId)) ||
    typeof credentials.email !== "string" ||
    !/^unimate-smoke-[0-9a-f-]+@example\.test$/i.test(credentials.email) ||
    typeof credentials.password !== "string" ||
    credentials.password.length < 32
  ) {
    throw new Error("Private local smoke credentials have an invalid format.");
  }

  return credentials;
}

async function removeSmokeCredentialsFile(filePath) {
  const location = await credentialsFileLocation(filePath);
  await unlink(location.path);
  await rmdir(location.directory);
}

export async function cleanupLocalSmokeFixture({
  target,
  userId,
  email,
  cleanupDatabaseIdentity,
  fetchImpl = globalThis.fetch,
  credentialsFile,
}) {
  const errors = [];
  let resolvedUserId = null;
  let authUserExists = false;
  const isSyntheticEmail =
    typeof email === "string" &&
    /^unimate-smoke-[0-9a-f-]+@example\.test$/i.test(email);

  if (!isSyntheticEmail) {
    errors.push(
      new Error("Smoke fixture cleanup requires its synthetic email."),
    );
  } else if (userId && !userIdPattern.test(userId)) {
    errors.push(
      new Error("Smoke fixture cleanup requires a valid local Auth user ID."),
    );
  } else if (userId) {
    try {
      const authUser = await getAuthUserById(target, userId, fetchImpl);
      if (authUser && authUser.email !== email) {
        errors.push(
          new Error(
            "Local Auth user ID does not match the synthetic fixture email.",
          ),
        );
      } else if (!authUser) {
        errors.push(
          new Error(
            "Local Auth fixture is missing; refusing UniMate identity deletion without a verified email match.",
          ),
        );
      } else {
        resolvedUserId = userId;
        authUserExists = true;
      }
    } catch (error) {
      errors.push(error);
    }
  } else if (isSyntheticEmail) {
    try {
      resolvedUserId = await findAuthUserByEmail(target, email, fetchImpl);
      authUserExists = resolvedUserId !== null;
    } catch {
      errors.push(
        new Error("Could not find a partially created local Auth user."),
      );
    }
  }

  if (resolvedUserId && authUserExists) {
    if (typeof cleanupDatabaseIdentity !== "function") {
      errors.push(
        new Error("The local UniMate identity cleaner is unavailable."),
      );
    } else {
      try {
        await cleanupDatabaseIdentity(resolvedUserId);
      } catch {
        errors.push(
          new Error("Could not delete the matching UniMate identity."),
        );
      }
    }

    if (errors.length === 0) {
      try {
        await deleteAuthUser(target, resolvedUserId, fetchImpl);
      } catch (error) {
        errors.push(error);
      }
    }
  }

  if (errors.length === 0 && credentialsFile) {
    try {
      await removeSmokeCredentialsFile(credentialsFile);
    } catch {
      errors.push(
        new Error("Could not remove the private local smoke credential file."),
      );
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      "Local synthetic smoke fixture cleanup failed; retry cleanup with the credential file.",
    );
  }
}

export async function createLocalSmokeFixture({
  target,
  cleanupDatabaseIdentity,
  fetchImpl = globalThis.fetch,
}) {
  const email = `unimate-smoke-${randomUUID()}@example.test`;
  const password = randomBytes(32).toString("base64url");
  let userId = null;
  let credentialsFile;
  let isCleaned = false;

  async function cleanup() {
    if (isCleaned) {
      return;
    }

    await cleanupLocalSmokeFixture({
      target,
      userId,
      email,
      cleanupDatabaseIdentity,
      fetchImpl,
      credentialsFile,
    });
    isCleaned = true;
  }

  let response;
  try {
    response = await authRequest(
      target,
      "/auth/v1/admin/users",
      {
        method: "POST",
        body: JSON.stringify({ email, password, email_confirm: true }),
      },
      fetchImpl,
    );

    if (!response.ok) {
      throw new Error(
        `Local Supabase Auth fixture creation failed (HTTP ${response.status}).`,
      );
    }

    const result = await response.json();
    if (!userIdPattern.test(result?.id ?? "")) {
      throw new Error(
        "Local Supabase Auth fixture creation returned invalid data.",
      );
    }
    userId = result.id;

    async function writeCredentialsFile() {
      if (!credentialsFile) {
        credentialsFile = await writeSmokeCredentialsFile({
          userId,
          email,
          password,
        });
      }
      return credentialsFile;
    }

    return {
      userId,
      email,
      password,
      writeCredentialsFile,
      cleanup,
    };
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      let recoveryFile;
      try {
        recoveryFile = await writeSmokeCredentialsFile({
          email,
          password,
          ...(userId ? { userId } : {}),
        });
      } catch (recoveryError) {
        throw new AggregateError(
          [error, cleanupError, recoveryError],
          "Local smoke fixture setup and cleanup failed; recovery credentials could not be safely retained.",
          { cause: recoveryError },
        );
      }

      throw new AggregateError(
        [error, cleanupError],
        `Local smoke fixture setup and cleanup failed; retry with \`pnpm smoke:fixture:cleanup -- ${recoveryFile}\`.`,
        { cause: cleanupError },
      );
    }

    throw error;
  }
}
