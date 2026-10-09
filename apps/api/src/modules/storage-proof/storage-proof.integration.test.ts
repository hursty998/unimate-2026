import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { z } from "zod";
import {
  authMeResponseSchema,
  storageProofCompletionResponseSchema,
  storageProofReadPermissionResponseSchema,
  storageProofUploadPermissionResponseSchema,
} from "@unimate/contracts";
import { parseObjectKey, type ObjectStorage } from "@unimate/storage";
import { createApiApplication } from "../../app.js";
import { parseApiConfig } from "../../config/environment.js";
import { DatabaseClientService } from "../../infrastructure/database/database.module.js";
import { OBJECT_STORAGE } from "../../infrastructure/object-storage.js";

function requiredEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Storage-proof integration requires ${name}.`);
  }

  return value;
}

const supabaseUrl = requiredEnvironment("SUPABASE_URL");
const publishableKey = requiredEnvironment("SUPABASE_TEST_PUBLISHABLE_KEY");
const secretKey = requiredEnvironment("SUPABASE_TEST_SECRET_KEY");
const bucketName = "foundation-storage-proof";
const authUserSchema = z.object({ id: z.string().uuid() });
const authSessionSchema = z.object({
  access_token: z.string().min(1),
  user: z.object({ id: z.string().uuid() }),
});

if (!secretKey.startsWith("sb_secret_")) {
  throw new Error(
    "Storage-proof integration requires the local sb_secret_ credential.",
  );
}

async function createLocalAuthUser(): Promise<{
  id: string;
  email: string;
  password: string;
}> {
  const email = `phase8-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString("base64url");
  const response = await fetch(new URL("/auth/v1/admin/users", supabaseUrl), {
    method: "POST",
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

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
): Promise<{ accessToken: string; userId: string }> {
  const response = await fetch(
    new URL("/auth/v1/token?grant_type=password", supabaseUrl),
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    },
  );

  assert.ok(
    response.ok,
    `Local Auth sign-in returned HTTP ${response.status}.`,
  );
  const session = authSessionSchema.parse(await response.json());
  return { accessToken: session.access_token, userId: session.user.id };
}

async function deleteLocalAuthUser(userId: string): Promise<void> {
  const response = await fetch(
    new URL(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, supabaseUrl),
    {
      method: "DELETE",
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
      },
    },
  );

  assert.ok(
    response.ok,
    `Local Auth user deletion returned HTTP ${response.status}.`,
  );
}

async function apiRequest(
  apiUrl: string,
  path: string,
  accessToken: string | undefined,
  input?: unknown,
): Promise<Response> {
  const headers = new Headers();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (input !== undefined) headers.set("content-type", "application/json");

  return fetch(new URL(path, apiUrl), {
    method: "POST",
    headers,
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
}

test(
  "real local Auth, Nest API, PostgreSQL, and private Storage round-trip bytes directly",
  { timeout: 120_000 },
  async () => {
    const config = parseApiConfig({
      ...process.env,
      API_HOST: "127.0.0.1",
      API_PORT: "3000",
      NODE_ENV: "test",
      SUPABASE_URL: supabaseUrl,
      SUPABASE_SECRET_KEY: secretKey,
      SUPABASE_STORAGE_BUCKET: bucketName,
    });
    const app = await createApiApplication(config);
    const providerUserIds: string[] = [];
    const appUserIds: string[] = [];
    const cleanupErrors: unknown[] = [];
    let database: DatabaseClientService | undefined;
    let objectStorage: ObjectStorage | undefined;
    let apiUrl: string | undefined;
    let ownerAccessToken: string | undefined;
    let proofId: string | undefined;
    let testFailed = false;
    let testFailure: unknown;

    try {
      await app.listen(0, "127.0.0.1");
      const apiDatabase = app.get(DatabaseClientService, { strict: false });
      database = apiDatabase;
      objectStorage = app.get<ObjectStorage>(OBJECT_STORAGE, {
        strict: false,
      });
      const address = app.getHttpServer().address();
      assert.ok(address && typeof address === "object");
      apiUrl = `http://127.0.0.1:${address.port}/`;

      const unauthenticatedIssue = await apiRequest(
        apiUrl,
        "v1/foundation/storage-proof/uploads/issue",
        undefined,
        {},
      );
      assert.equal(unauthenticatedIssue.status, 401);

      const ownerAuthUser = await createLocalAuthUser();
      providerUserIds.push(ownerAuthUser.id);
      const ownerSession = await signInWithPassword(
        ownerAuthUser.email,
        ownerAuthUser.password,
      );
      ownerAccessToken = ownerSession.accessToken;

      const otherAuthUser = await createLocalAuthUser();
      providerUserIds.push(otherAuthUser.id);
      const otherSession = await signInWithPassword(
        otherAuthUser.email,
        otherAuthUser.password,
      );

      const ownerIdentityResponse = await fetch(new URL("v1/auth/me", apiUrl), {
        headers: { Authorization: `Bearer ${ownerAccessToken}` },
      });
      assert.equal(ownerIdentityResponse.status, 200);
      const ownerIdentity = authMeResponseSchema.parse(
        await ownerIdentityResponse.json(),
      );
      appUserIds.push(ownerIdentity.user.id);

      const otherIdentityResponse = await fetch(new URL("v1/auth/me", apiUrl), {
        headers: { Authorization: `Bearer ${otherSession.accessToken}` },
      });
      assert.equal(otherIdentityResponse.status, 200);
      const otherIdentity = authMeResponseSchema.parse(
        await otherIdentityResponse.json(),
      );
      appUserIds.push(otherIdentity.user.id);

      const issueResponse = await apiRequest(
        apiUrl,
        "v1/foundation/storage-proof/uploads/issue",
        ownerAccessToken,
        {},
      );
      assert.equal(issueResponse.status, 200);
      const issued = storageProofUploadPermissionResponseSchema.parse(
        await issueResponse.json(),
      );
      proofId = issued.id;
      assert.equal("objectKey" in issued, false);
      assert.equal(JSON.stringify(issued).includes(secretKey), false);

      const pendingRecord = await apiDatabase.client.storedObject.findUnique({
        where: { id: issued.id },
      });
      assert.ok(pendingRecord);
      assert.equal(pendingRecord.creatorUserId, ownerIdentity.user.id);
      assert.match(
        pendingRecord.objectKey,
        /^foundation-storage-proof\/[0-9a-f-]+\.txt$/,
      );
      assert.equal(pendingRecord.status, "PENDING");
      assert.equal(pendingRecord.sizeBytes, null);
      assert.equal(pendingRecord.completedAt, null);
      assert.deepEqual(Object.keys(pendingRecord).sort(), [
        "completedAt",
        "contentType",
        "createdAt",
        "creatorUserId",
        "id",
        "objectKey",
        "sizeBytes",
        "status",
      ]);

      for (const [path, body] of [
        ["v1/foundation/storage-proof/uploads/complete", { id: issued.id }],
        ["v1/foundation/storage-proof/read-permission", { id: issued.id }],
        ["v1/foundation/storage-proof/delete", { id: issued.id }],
      ] as const) {
        const denied = await apiRequest(
          apiUrl,
          path,
          otherSession.accessToken,
          body,
        );
        assert.equal(denied.status, 404);
        assert.equal(
          (await denied.text()).includes(pendingRecord.objectKey),
          false,
        );
      }

      const earlyRead = await apiRequest(
        apiUrl,
        "v1/foundation/storage-proof/read-permission",
        ownerAccessToken,
        { id: issued.id },
      );
      assert.equal(earlyRead.status, 409);

      const expectedBytes = Buffer.from(
        "UniMate Phase 8 synthetic direct-upload proof.\n",
        "utf8",
      );
      const storageOrigin = new URL(issued.upload.url).origin;
      assert.equal(storageOrigin, supabaseUrl);
      assert.notEqual(storageOrigin, new URL(apiUrl).origin);
      const uploadResponse = await fetch(issued.upload.url, {
        method: issued.upload.method,
        headers: issued.upload.headers,
        body: expectedBytes,
      });
      assert.ok(
        uploadResponse.ok,
        `Direct Storage PUT returned HTTP ${uploadResponse.status}.`,
      );

      const completionResponse = await apiRequest(
        apiUrl,
        "v1/foundation/storage-proof/uploads/complete",
        ownerAccessToken,
        { id: issued.id },
      );
      assert.equal(completionResponse.status, 200);
      const completed = storageProofCompletionResponseSchema.parse(
        await completionResponse.json(),
      );
      assert.equal(completed.status, "READY");
      assert.equal(completed.sizeBytes, expectedBytes.byteLength);

      const readyRecord = await apiDatabase.client.storedObject.findUnique({
        where: { id: issued.id },
      });
      assert.equal(readyRecord?.status, "READY");
      assert.equal(readyRecord?.sizeBytes, expectedBytes.byteLength);
      assert.ok(readyRecord?.completedAt instanceof Date);

      const readResponse = await apiRequest(
        apiUrl,
        "v1/foundation/storage-proof/read-permission",
        ownerAccessToken,
        { id: issued.id },
      );
      assert.equal(readResponse.status, 200);
      const readPermission = storageProofReadPermissionResponseSchema.parse(
        await readResponse.json(),
      );
      assert.equal(new URL(readPermission.url).origin, supabaseUrl);

      const downloadedResponse = await fetch(readPermission.url);
      assert.ok(
        downloadedResponse.ok,
        `Direct Storage GET returned HTTP ${downloadedResponse.status}.`,
      );
      const downloadedBytes = Buffer.from(
        await downloadedResponse.arrayBuffer(),
      );
      assert.deepEqual(downloadedBytes, expectedBytes);

      const cleanupResponse = await apiRequest(
        apiUrl,
        "v1/foundation/storage-proof/delete",
        ownerAccessToken,
        { id: issued.id },
      );
      assert.equal(cleanupResponse.status, 200);
      assert.deepEqual(await cleanupResponse.json(), { deleted: true });
      proofId = undefined;
      assert.equal(
        await apiDatabase.client.storedObject.findUnique({
          where: { id: issued.id },
        }),
        null,
      );
    } catch (error) {
      testFailed = true;
      testFailure = error;
    }

    if (proofId && apiUrl && ownerAccessToken) {
      try {
        const cleanupResponse = await apiRequest(
          apiUrl,
          "v1/foundation/storage-proof/delete",
          ownerAccessToken,
          { id: proofId },
        );
        if (cleanupResponse.status !== 200 && cleanupResponse.status !== 404) {
          cleanupErrors.push(
            new Error(`API cleanup returned HTTP ${cleanupResponse.status}.`),
          );
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (database && appUserIds.length > 0) {
      try {
        const remainingObjects = await database.client.storedObject.findMany({
          where: { creatorUserId: { in: appUserIds } },
          select: { id: true, objectKey: true },
        });

        for (const record of remainingObjects) {
          if (!objectStorage) {
            throw new Error("ObjectStorage was not available for cleanup.");
          }
          await objectStorage.deleteObject(parseObjectKey(record.objectKey));
        }

        await database.client.storedObject.deleteMany({
          where: { id: { in: remainingObjects.map(({ id }) => id) } },
        });
        await database.client.user.deleteMany({
          where: { id: { in: appUserIds } },
        });
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

    if (testFailed) {
      const failure =
        testFailure instanceof Error
          ? testFailure
          : new Error("The local storage-proof integration failed.", {
              cause: testFailure,
            });
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [failure, ...cleanupErrors],
          "Local storage-proof integration and cleanup failed.",
        );
      }
      throw failure;
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        "Local storage-proof integration cleanup failed.",
      );
    }
  },
);
