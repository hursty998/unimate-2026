import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { authMeResponseSchema } from "@unimate/contracts";
import { z } from "zod";
import { createApiApplication } from "../../app.js";
import { parseApiConfig } from "../../config/environment.js";
import { DatabaseClientService } from "../../infrastructure/database/database.module.js";

function requiredEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Local Auth integration requires ${name}.`);
  }

  return value;
}

const supabaseUrl = requiredEnvironment("SUPABASE_URL");
const publishableKey = requiredEnvironment("SUPABASE_TEST_PUBLISHABLE_KEY");
const testSecretKey = requiredEnvironment("SUPABASE_TEST_SECRET_KEY");

const authUserSchema = z.object({ id: z.string().uuid() });
const authSessionSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  user: authUserSchema,
});

if (!testSecretKey.startsWith("sb_secret_")) {
  throw new Error(
    "Local Auth integration requires the current sb_secret_ test credential.",
  );
}

async function authRequest(
  path: string,
  key: string,
  body: unknown,
  bearer?: string,
): Promise<Response> {
  const headers = new Headers({
    apikey: key,
    "content-type": "application/json",
  });

  if (bearer) {
    headers.set("Authorization", `Bearer ${bearer}`);
  }

  return fetch(new URL(path, `${supabaseUrl}/`), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function createLocalAuthUser(
  suffix: string,
): Promise<{ id: string; email: string; password: string }> {
  const email = `phase5-${suffix}-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString("base64url");
  const response = await authRequest(
    "/auth/v1/admin/users",
    testSecretKey,
    { email, password, email_confirm: true },
    testSecretKey,
  );

  assert.ok(
    response.ok,
    `Local Auth user creation returned HTTP ${response.status}.`,
  );
  const user = authUserSchema.parse(await response.json());
  return { id: user.id, email, password };
}

async function signInWithPassword(
  email: string,
  password: string,
): Promise<z.infer<typeof authSessionSchema>> {
  const response = await authRequest(
    "/auth/v1/token?grant_type=password",
    publishableKey,
    { email, password },
  );

  assert.ok(
    response.ok,
    `Local Auth password sign-in returned HTTP ${response.status}.`,
  );
  return authSessionSchema.parse(await response.json());
}

async function refreshSession(
  refreshToken: string,
): Promise<z.infer<typeof authSessionSchema>> {
  const response = await authRequest(
    "/auth/v1/token?grant_type=refresh_token",
    publishableKey,
    { refresh_token: refreshToken },
  );

  assert.ok(
    response.ok,
    `Local Auth session refresh returned HTTP ${response.status}.`,
  );
  return authSessionSchema.parse(await response.json());
}

async function deleteLocalAuthUser(userId: string): Promise<void> {
  const response = await fetch(
    new URL(
      `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      `${supabaseUrl}/`,
    ),
    {
      method: "DELETE",
      headers: {
        apikey: testSecretKey,
        Authorization: `Bearer ${testSecretKey}`,
      },
    },
  );

  assert.ok(
    response.ok,
    `Local Auth test-user deletion returned HTTP ${response.status}.`,
  );
}

test("real local Supabase Auth provisions and refreshes API identity", async () => {
  const config = parseApiConfig({
    ...process.env,
    NODE_ENV: "test",
    API_HOST: "127.0.0.1",
    API_PORT: "3000",
  });
  const app = await createApiApplication(config);
  const providerUserIds: string[] = [];
  let database: DatabaseClientService | undefined;
  const cleanupErrors: unknown[] = [];

  try {
    await app.listen(0, "127.0.0.1");
    const apiDatabase = app.get(DatabaseClientService, { strict: false });
    database = apiDatabase;

    const address = app.getHttpServer().address();
    assert.ok(address && typeof address === "object");
    const apiUrl = `http://127.0.0.1:${address.port}/v1/auth/me`;

    const firstUser = await createLocalAuthUser("identity");
    providerUserIds.push(firstUser.id);
    const firstSession = await signInWithPassword(
      firstUser.email,
      firstUser.password,
    );
    const firstResponse = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${firstSession.access_token}` },
    });

    assert.equal(firstResponse.status, 200);
    const firstIdentity = authMeResponseSchema.parse(
      await firstResponse.json(),
    );
    assert.deepEqual(firstIdentity.universityAffiliations, []);

    const repeatedResponse = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${firstSession.access_token}` },
    });
    assert.equal(repeatedResponse.status, 200);
    assert.deepEqual(
      authMeResponseSchema.parse(await repeatedResponse.json()),
      firstIdentity,
    );

    const refreshedSession = await refreshSession(firstSession.refresh_token);
    const refreshedResponse = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${refreshedSession.access_token}` },
    });
    assert.equal(refreshedResponse.status, 200);
    assert.deepEqual(
      authMeResponseSchema.parse(await refreshedResponse.json()),
      firstIdentity,
    );

    const concurrentUser = await createLocalAuthUser("concurrent");
    providerUserIds.push(concurrentUser.id);
    const concurrentSession = await signInWithPassword(
      concurrentUser.email,
      concurrentUser.password,
    );
    const concurrentResponses = await Promise.all(
      Array.from({ length: 12 }, () =>
        fetch(apiUrl, {
          headers: {
            Authorization: `Bearer ${concurrentSession.access_token}`,
          },
        }),
      ),
    );

    assert.ok(concurrentResponses.every(({ status }) => status === 200));
    const concurrentIdentities = await Promise.all(
      concurrentResponses.map(async (response) =>
        authMeResponseSchema.parse(await response.json()),
      ),
    );
    assert.equal(
      new Set(concurrentIdentities.map(({ user }) => user.id)).size,
      1,
    );
    assert.ok(
      concurrentIdentities.every(
        ({ universityAffiliations }) => universityAffiliations.length === 0,
      ),
    );

    const storedIdentities = await apiDatabase.client.authIdentity.findMany({
      where: {
        provider: "SUPABASE",
        providerSubject: { in: providerUserIds },
      },
      include: { user: true },
    });
    assert.equal(storedIdentities.length, 2);
    assert.equal(new Set(storedIdentities.map(({ userId }) => userId)).size, 2);
    assert.ok(
      storedIdentities.every(
        ({ user }) =>
          Object.keys(user).sort().join(",") === "createdAt,id,updatedAt",
      ),
    );
  } finally {
    if (database && providerUserIds.length > 0) {
      try {
        const identities = await database.client.authIdentity.findMany({
          where: {
            provider: "SUPABASE",
            providerSubject: { in: providerUserIds },
          },
          select: { userId: true },
        });
        const userIds = identities.map(({ userId }) => userId);

        if (userIds.length > 0) {
          await database.client.user.deleteMany({
            where: { id: { in: userIds } },
          });
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    try {
      await app.close();
    } catch (error) {
      cleanupErrors.push(error);
    }

    for (const userId of providerUserIds) {
      try {
        await deleteLocalAuthUser(userId);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      "Local Auth integration cleanup failed.",
    );
  }
});
