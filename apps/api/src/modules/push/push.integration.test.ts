import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pushRegistrationResponseSchema } from "@unimate/contracts";
import { FOUNDATION_PUSH_SEND_JOB_TYPE } from "@unimate/jobs";
import { test } from "node:test";
import { createApiApplication } from "../../app.js";
import type { ApiConfig } from "../../config/environment.js";
import { DatabaseClientService } from "../../infrastructure/database/database.module.js";

const databaseUrl = process.env["DATABASE_URL"];

if (databaseUrl === undefined) {
  throw new Error(
    "DATABASE_URL is required for the local push-registration integration test.",
  );
}

const config: ApiConfig = {
  host: "127.0.0.1",
  port: 3000,
  nodeEnv: "test",
  corsOrigins: [],
  databaseUrl,
  supabaseUrl: "http://127.0.0.1:55321",
  supabaseJwtAudience: "authenticated",
  supabaseSecretKey: "sb_secret_test-only",
  supabaseStorageBucket: "foundation-storage-proof",
};

test("authenticated push registration transfers ownership safely and queues only registration IDs", async () => {
  const suffix = randomUUID();
  const ownerSubject = `phase10-push-owner:${suffix}`;
  const otherSubject = `phase10-push-other:${suffix}`;
  const token = `synthetic-expo-token:${suffix}`;
  const ownerUserIds: string[] = [];
  const outboxIds: string[] = [];
  const app = await createApiApplication(config, {
    tokenVerifier: {
      async verify(tokenValue) {
        if (tokenValue === "phase10-owner") {
          return { provider: "SUPABASE", providerSubject: ownerSubject };
        }
        if (tokenValue === "phase10-other") {
          return { provider: "SUPABASE", providerSubject: otherSubject };
        }
        throw new Error("Unknown synthetic integration credential.");
      },
    },
  });
  const database = app.get(DatabaseClientService, { strict: false });
  const authHeaders = (tokenValue: string) => ({
    authorization: `Bearer ${tokenValue}`,
  });

  try {
    const owner = await database.client.user.create({ data: {} });
    ownerUserIds.push(owner.id);
    const other = await database.client.user.create({ data: {} });
    ownerUserIds.push(other.id);
    await database.client.authIdentity.createMany({
      data: [
        {
          userId: owner.id,
          provider: "SUPABASE",
          providerSubject: ownerSubject,
        },
        {
          userId: other.id,
          provider: "SUPABASE",
          providerSubject: otherSubject,
        },
      ],
    });

    const unauthenticated = await app.inject({
      method: "POST",
      url: "/v1/push-registrations/register",
      payload: { token, platform: "ios" },
    });
    assert.equal(unauthenticated.statusCode, 401);

    const firstResponse = await app.inject({
      method: "POST",
      url: "/v1/push-registrations/register",
      headers: authHeaders("phase10-owner"),
      payload: { token, platform: "ios" },
    });
    assert.equal(firstResponse.statusCode, 200);
    assert.equal(firstResponse.body.includes(token), false);
    const first = pushRegistrationResponseSchema.parse(firstResponse.json());

    const repeatedResponse = await app.inject({
      method: "POST",
      url: "/v1/push-registrations/register",
      headers: authHeaders("phase10-owner"),
      payload: { token, platform: "ios" },
    });
    const repeated = pushRegistrationResponseSchema.parse(
      repeatedResponse.json(),
    );
    assert.equal(repeated.id, first.id);

    const secondDeviceResponse = await app.inject({
      method: "POST",
      url: "/v1/push-registrations/register",
      headers: authHeaders("phase10-owner"),
      payload: { token: `${token}:second-device`, platform: "ios" },
    });
    const secondDevice = pushRegistrationResponseSchema.parse(
      secondDeviceResponse.json(),
    );
    assert.notEqual(secondDevice.id, first.id);

    const proofBeforeTransfer = await app.inject({
      method: "POST",
      url: "/v1/foundation/push-proof",
      headers: authHeaders("phase10-owner"),
      payload: { registrationId: first.id },
    });
    assert.equal(proofBeforeTransfer.statusCode, 200);
    const oldProofId = proofBeforeTransfer.json<{
      proofId: string;
    }>().proofId;
    outboxIds.push(oldProofId);

    const transferredResponse = await app.inject({
      method: "POST",
      url: "/v1/push-registrations/register",
      headers: authHeaders("phase10-other"),
      payload: { token, platform: "android" },
    });
    assert.equal(transferredResponse.statusCode, 200);
    assert.equal(transferredResponse.body.includes(token), false);
    const transferred = pushRegistrationResponseSchema.parse(
      transferredResponse.json(),
    );
    assert.notEqual(transferred.id, first.id);

    const registrations = await database.client.pushRegistration.findMany({
      where: { providerToken: token, provider: "EXPO" },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(registrations.length, 2);
    assert.deepEqual(
      registrations.map(({ id, status }) => ({ id, status })),
      [
        { id: first.id, status: "DISABLED" },
        { id: transferred.id, status: "ACTIVE" },
      ],
    );

    const oldProofSend = await database.client.outboxMessage.findUnique({
      where: { id: oldProofId },
    });
    assert.equal(oldProofSend?.eventType, FOUNDATION_PUSH_SEND_JOB_TYPE);
    assert.equal(oldProofSend?.payloadVersion, 1);
    assert.deepEqual(oldProofSend?.payload, { registrationId: first.id });
    assert.equal(
      JSON.stringify(oldProofSend?.payload ?? null).includes(token),
      false,
    );

    const hiddenProof = await app.inject({
      method: "POST",
      url: "/v1/foundation/push-proof",
      headers: authHeaders("phase10-owner"),
      payload: { registrationId: transferred.id },
    });
    assert.equal(hiddenProof.statusCode, 404);
    const unownedUnregister = await app.inject({
      method: "POST",
      url: "/v1/push-registrations/unregister",
      headers: authHeaders("phase10-owner"),
      payload: { id: transferred.id },
    });
    const missingUnregister = await app.inject({
      method: "POST",
      url: "/v1/push-registrations/unregister",
      headers: authHeaders("phase10-owner"),
      payload: { id: randomUUID() },
    });
    assert.equal(unownedUnregister.statusCode, 404);
    assert.equal(missingUnregister.statusCode, 404);
    assert.equal(unownedUnregister.body.includes(transferred.id), false);

    const reactivatedResponse = await app.inject({
      method: "POST",
      url: "/v1/push-registrations/register",
      headers: authHeaders("phase10-other"),
      payload: { token, platform: "android" },
    });
    const reactivated = pushRegistrationResponseSchema.parse(
      reactivatedResponse.json(),
    );
    assert.equal(reactivated.id, transferred.id);
    assert.equal(reactivated.status, "ACTIVE");

    const unregister = await app.inject({
      method: "POST",
      url: "/v1/push-registrations/unregister",
      headers: authHeaders("phase10-other"),
      payload: { id: transferred.id },
    });
    assert.equal(unregister.statusCode, 200);
    assert.deepEqual(unregister.json(), { disabled: true });

    const reactivatedAfterDisableResponse = await app.inject({
      method: "POST",
      url: "/v1/push-registrations/register",
      headers: authHeaders("phase10-other"),
      payload: { token, platform: "android" },
    });
    const reactivatedAfterDisable = pushRegistrationResponseSchema.parse(
      reactivatedAfterDisableResponse.json(),
    );
    assert.notEqual(reactivatedAfterDisable.id, transferred.id);
    assert.equal(reactivatedAfterDisable.status, "ACTIVE");
    assert.equal(
      await database.client.pushRegistration.count({
        where: { providerToken: token, provider: "EXPO", status: "ACTIVE" },
      }),
      1,
    );
  } finally {
    if (outboxIds.length > 0) {
      await database.client.outboxMessage.deleteMany({
        where: { id: { in: outboxIds } },
      });
    }
    if (ownerUserIds.length > 0) {
      await database.client.user.deleteMany({
        where: { id: { in: ownerUserIds } },
      });
    }
    await app.close();
  }
});
