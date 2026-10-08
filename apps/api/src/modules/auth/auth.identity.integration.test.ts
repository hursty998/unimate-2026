import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { DatabaseClientService } from "../../infrastructure/database/database.module.js";
import { AuthMeService } from "./auth-me.service.js";

const databaseUrl = process.env["DATABASE_URL"];

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. Run `pnpm db:start` and configure packages/database/.env.",
  );
}

test("identity provisioning is atomic, repeatable, and race-safe in PostgreSQL", async () => {
  const database = new DatabaseClientService(databaseUrl);
  const service = new AuthMeService(database);
  const suffix = randomUUID();
  const providerSubjects = [
    `phase5-provision:${suffix}`,
    `phase5-concurrent:${suffix}`,
  ];
  const universityIds: string[] = [];
  const initialUserCount = await database.client.user.count();

  try {
    const first = await service.getMe({
      provider: "SUPABASE",
      providerSubject: providerSubjects[0]!,
    });
    const repeated = await service.getMe({
      provider: "SUPABASE",
      providerSubject: providerSubjects[0]!,
    });

    assert.equal(repeated.user.id, first.user.id);
    assert.deepEqual(first.universityAffiliations, []);
    assert.deepEqual(repeated.universityAffiliations, []);

    const concurrentResponses = await Promise.all(
      Array.from({ length: 12 }, () =>
        service.getMe({
          provider: "SUPABASE",
          providerSubject: providerSubjects[1]!,
        }),
      ),
    );
    const concurrentUserIds = new Set(
      concurrentResponses.map(({ user }) => user.id),
    );

    assert.equal(concurrentUserIds.size, 1);
    assert.ok(
      concurrentResponses.every(
        ({ universityAffiliations }) => universityAffiliations.length === 0,
      ),
    );

    const identities = await database.client.authIdentity.findMany({
      where: { providerSubject: { in: providerSubjects } },
      include: { user: true },
    });
    assert.equal(identities.length, 2);
    assert.equal(new Set(identities.map(({ userId }) => userId)).size, 2);
    assert.equal((await database.client.user.count()) - initialUserCount, 2);
    assert.ok(
      identities.every(
        ({ provider, providerSubject }) =>
          provider === "SUPABASE" && providerSubjects.includes(providerSubject),
      ),
    );
    assert.deepEqual(Object.keys(identities[0]!.user).sort(), [
      "createdAt",
      "id",
      "updatedAt",
    ]);

    const university = await database.client.university.create({
      data: {
        name: `Phase 5 integration ${suffix}`,
        slug: `phase5-${suffix}-a`,
      },
    });
    universityIds.push(university.id);
    const secondUniversity = await database.client.university.create({
      data: {
        name: `Phase 5 integration secondary ${suffix}`,
        slug: `phase5-${suffix}-b`,
      },
    });
    universityIds.push(secondUniversity.id);

    await database.client.universityAffiliation.create({
      data: {
        userId: first.user.id,
        universityId: secondUniversity.id,
      },
    });
    await database.client.universityAffiliation.create({
      data: {
        userId: first.user.id,
        universityId: university.id,
      },
    });

    const withAffiliation = await service.getMe({
      provider: "SUPABASE",
      providerSubject: providerSubjects[0]!,
    });
    assert.deepEqual(withAffiliation, {
      user: { id: first.user.id },
      universityAffiliations: [university.id, secondUniversity.id]
        .sort()
        .map((universityId) => ({ universityId })),
    });
  } finally {
    try {
      const testIdentities = await database.client.authIdentity.findMany({
        where: { providerSubject: { in: providerSubjects } },
        select: { userId: true },
      });
      const testUserIds = testIdentities.map(({ userId }) => userId);

      if (testUserIds.length > 0) {
        await database.client.user.deleteMany({
          where: { id: { in: testUserIds } },
        });
      }
      if (universityIds.length > 0) {
        await database.client.university.deleteMany({
          where: { id: { in: universityIds } },
        });
      }
    } finally {
      await database.onModuleDestroy();
    }
  }
});
