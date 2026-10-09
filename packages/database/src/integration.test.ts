import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import { test } from "node:test";
import { AuthProvider, Prisma } from "./generated/prisma/client.js";
import { createDatabaseClient } from "./index.js";

const connectionString = process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is required. Start local PostgreSQL with `pnpm db:start` and copy packages/database/.env.example to packages/database/.env.",
  );
}

interface ColumnInfo {
  schemaName: string;
  tableName: string;
  columnName: string;
  dataType: string;
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function isPayloadVersionConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("outbox_messages_payload_version_positive") ||
      hasCode(error, "P2004") ||
      hasCode(error, "P2010"))
  );
}

test("foundation models persist correctly in local PostgreSQL", async () => {
  const prisma = createDatabaseClient({ connectionString });
  const userIds: string[] = [];
  const outboxIds: string[] = [];
  const storedObjectIds: string[] = [];
  let universityId: string | undefined;
  let connected = false;

  try {
    try {
      await prisma.$connect();
      connected = true;
    } catch (cause) {
      throw new Error(
        "Could not connect to local PostgreSQL. Run `pnpm db:start` and check packages/database/.env.",
        { cause },
      );
    }

    const suffix = randomUUID();
    const providerSubject = `integration:${suffix}`;
    const user = await prisma.user.create({ data: {} });
    userIds.push(user.id);

    assert.match(
      user.id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.ok(user.createdAt instanceof Date);
    assert.ok(user.updatedAt instanceof Date);

    const identity = await prisma.authIdentity.create({
      data: {
        provider: AuthProvider.SUPABASE,
        providerSubject,
        userId: user.id,
      },
    });
    const mappedIdentity = await prisma.authIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: AuthProvider.SUPABASE,
          providerSubject,
        },
      },
      include: { user: true },
    });

    assert.equal(identity.userId, user.id);
    assert.equal(mappedIdentity?.user.id, user.id);

    const storedObject = await prisma.storedObject.create({
      data: {
        objectKey: `foundation-storage-proof/${suffix}.txt`,
        creatorUserId: user.id,
        contentType: "text/plain",
      },
    });
    storedObjectIds.push(storedObject.id);
    assert.match(
      storedObject.id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.equal(storedObject.status, "PENDING");
    assert.equal(storedObject.sizeBytes, null);
    assert.equal(storedObject.completedAt, null);

    await assert.rejects(
      prisma.storedObject.update({
        where: { id: storedObject.id },
        data: { status: "READY", sizeBytes: 42 },
      }),
      (error: unknown) =>
        error instanceof Error &&
        (error.message.includes("stored_objects_lifecycle_valid") ||
          hasCode(error, "P2004") ||
          hasCode(error, "P2010")),
    );

    const completedObject = await prisma.storedObject.update({
      where: { id: storedObject.id },
      data: {
        status: "READY",
        sizeBytes: 42,
        completedAt: new Date(),
      },
    });
    assert.equal(completedObject.status, "READY");
    assert.equal(completedObject.sizeBytes, 42);
    assert.ok(completedObject.completedAt instanceof Date);
    await assert.rejects(
      prisma.user.delete({ where: { id: user.id } }),
      (error: unknown) => hasCode(error, "P2003"),
    );

    await assert.rejects(
      prisma.authIdentity.create({
        data: {
          provider: AuthProvider.SUPABASE,
          providerSubject,
          userId: user.id,
        },
      }),
      (error: unknown) => hasCode(error, "P2002"),
    );

    const university = await prisma.university.create({
      data: {
        name: `Integration University ${suffix}`,
        slug: `integration-${suffix}`,
      },
    });
    universityId = university.id;

    assert.equal(
      (
        await prisma.university.findUnique({
          where: { slug: university.slug },
        })
      )?.id,
      university.id,
    );
    await assert.rejects(
      prisma.university.create({
        data: { name: "Duplicate slug", slug: university.slug },
      }),
      (error: unknown) => hasCode(error, "P2002"),
    );

    await prisma.universityAffiliation.create({
      data: { userId: user.id, universityId: university.id },
    });
    const affiliations = await prisma.universityAffiliation.findMany({
      where: { userId: user.id },
      include: { user: true, university: true },
    });

    assert.equal(affiliations.length, 1);
    assert.equal(affiliations[0]?.user.id, user.id);
    assert.equal(affiliations[0]?.university.id, university.id);
    await assert.rejects(
      prisma.universityAffiliation.create({
        data: { userId: user.id, universityId: university.id },
      }),
      (error: unknown) => hasCode(error, "P2002"),
    );

    const unaffiliatedUser = await prisma.user.create({ data: {} });
    userIds.push(unaffiliatedUser.id);
    await prisma.authIdentity.create({
      data: {
        provider: AuthProvider.SUPABASE,
        providerSubject: `integration:external:${suffix}`,
        userId: unaffiliatedUser.id,
      },
    });
    const externalUser = await prisma.user.findUnique({
      where: { id: unaffiliatedUser.id },
      include: { universityAffiliations: true },
    });

    assert.deepEqual(externalUser?.universityAffiliations, []);

    const payload = {
      kind: "integration-test",
      sequence: 1,
      nested: { ready: true },
    } satisfies Prisma.InputJsonValue;
    const outboxMessage = await prisma.outboxMessage.create({
      data: { eventType: "foundation.integration-test", payload },
    });
    outboxIds.push(outboxMessage.id);
    const storedMessage = await prisma.outboxMessage.findUniqueOrThrow({
      where: { id: outboxMessage.id },
    });

    assert.deepEqual(storedMessage.payload, payload);
    assert.equal(storedMessage.payloadVersion, 1);
    assert.equal(storedMessage.publishedAt, null);
    assert.ok(storedMessage.createdAt instanceof Date);
    await assert.rejects(
      prisma.outboxMessage.create({
        data: {
          eventType: "foundation.invalid-version",
          payloadVersion: 0,
          payload: {},
        },
      }),
      isPayloadVersionConstraintError,
    );

    const outboxEpochs = await prisma.$queryRaw<
      Array<{ epochMilliseconds: number }>
    >`
      SELECT EXTRACT(EPOCH FROM created_at)::double precision * 1000
        AS "epochMilliseconds"
      FROM app.outbox_messages
      WHERE id = ${outboxMessage.id}::uuid
    `;
    assert.ok(outboxEpochs[0]);
    assert.ok(
      Math.abs(
        outboxEpochs[0].epochMilliseconds - storedMessage.createdAt.getTime(),
      ) < 1,
    );

    const columns = await prisma.$queryRaw<ColumnInfo[]>`
      SELECT
        table_schema AS "schemaName",
        table_name AS "tableName",
        column_name AS "columnName",
        data_type AS "dataType"
      FROM information_schema.columns
      WHERE table_schema = 'app'
        AND (
          (table_name = 'users' AND column_name IN ('id', 'created_at'))
          OR (table_name = 'outbox_messages' AND column_name IN ('id', 'payload'))
          OR (
            table_name = 'stored_objects'
            AND column_name IN (
              'id',
              'object_key',
              'creator_user_id',
              'content_type',
              'status',
              'size_bytes',
              'created_at',
              'completed_at'
            )
          )
        )
    `;
    const columnType = (tableName: string, columnName: string) => {
      const column = columns.find(
        (item) =>
          item.tableName === tableName && item.columnName === columnName,
      );
      assert.ok(column, `Missing app.${tableName}.${columnName}`);
      assert.equal(column.schemaName, "app");
      return column.dataType;
    };

    assert.equal(columnType("users", "id"), "uuid");
    assert.equal(columnType("users", "created_at"), "timestamp with time zone");
    assert.equal(columnType("outbox_messages", "id"), "uuid");
    assert.equal(columnType("outbox_messages", "payload"), "jsonb");
    assert.equal(columnType("stored_objects", "id"), "uuid");
    assert.equal(columnType("stored_objects", "object_key"), "text");
    assert.equal(columnType("stored_objects", "creator_user_id"), "uuid");
    assert.equal(columnType("stored_objects", "content_type"), "text");
    assert.equal(columnType("stored_objects", "size_bytes"), "integer");
    assert.equal(
      columnType("stored_objects", "created_at"),
      "timestamp with time zone",
    );
    assert.equal(
      columnType("stored_objects", "completed_at"),
      "timestamp with time zone",
    );

    const storedObjectColumns = await prisma.$queryRaw<
      Array<{ columnName: string }>
    >`
      SELECT column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name = 'stored_objects'
      ORDER BY ordinal_position
    `;
    assert.deepEqual(
      storedObjectColumns.map(({ columnName }) => columnName),
      [
        "id",
        "object_key",
        "creator_user_id",
        "content_type",
        "status",
        "size_bytes",
        "created_at",
        "completed_at",
      ],
    );

    const appTables = await prisma.$queryRaw<Array<{ tableName: string }>>`
      SELECT table_name AS "tableName"
      FROM information_schema.tables
      WHERE table_schema = 'app'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name
    `;
    assert.deepEqual(
      appTables.map(({ tableName }) => tableName).sort(),
      [
        "auth_identities",
        "capability_assignments",
        "outbox_messages",
        "role_assignments",
        "role_capabilities",
        "roles",
        "stored_objects",
        "universities",
        "university_affiliations",
        "users",
      ].sort(),
    );

    const migrationHistorySchemas = await prisma.$queryRaw<
      Array<{ schemaName: string }>
    >`
      SELECT table_schema AS "schemaName"
      FROM information_schema.tables
      WHERE table_name = '_prisma_migrations'
      ORDER BY table_schema
    `;
    assert.deepEqual(migrationHistorySchemas, [{ schemaName: "app" }]);

    const providerSchemas = await prisma.$queryRaw<
      Array<{ schemaName: string }>
    >`
      SELECT schema_name AS "schemaName"
      FROM information_schema.schemata
      WHERE schema_name IN ('auth', 'storage')
      ORDER BY schema_name
    `;
    assert.deepEqual(
      providerSchemas.map(({ schemaName }) => schemaName),
      ["auth", "storage"],
    );
  } finally {
    try {
      if (connected) {
        if (outboxIds.length > 0) {
          await prisma.outboxMessage.deleteMany({
            where: { id: { in: outboxIds } },
          });
        }
        if (storedObjectIds.length > 0) {
          await prisma.storedObject.deleteMany({
            where: { id: { in: storedObjectIds } },
          });
        }
        if (userIds.length > 0) {
          await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        }
        if (universityId) {
          await prisma.university.deleteMany({
            where: { id: universityId },
          });
        }
      }
    } finally {
      await prisma.$disconnect();
    }
  }
});
