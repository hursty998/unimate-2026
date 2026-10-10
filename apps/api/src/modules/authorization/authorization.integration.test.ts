import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { AuthorizationScopeKinds, Capabilities } from "@unimate/authorization";
import { DatabaseClientService } from "../../infrastructure/database/database.module.js";
import type { AuthenticatedPrincipal } from "../auth/authenticated-principal.js";
import { AuthorizationService } from "./authorization.service.js";
import { TestOnlyOwnedDraftResourceService } from "../../test-support/owned-draft-resource-service.js";

const databaseUrl = process.env["DATABASE_URL"];

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. Run `pnpm db:start` and configure packages/database/.env.",
  );
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function isForeignKeyConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2003"
  );
}

test("AuthorizationService resolves exact grants and scoped denials in PostgreSQL", async () => {
  const database = new DatabaseClientService({
    connectionString: databaseUrl,
  });
  const service = new AuthorizationService(database);
  const suffix = randomUUID();
  const userIds: string[] = [];
  const providerSubjects: string[] = [];
  const roleIds: string[] = [];
  const universityIds: string[] = [];

  const createUser = async (label: string) => {
    const user = await database.client.user.create({ data: {} });
    userIds.push(user.id);
    const providerSubject = `phase6-authorization:${suffix}:${label}`;
    providerSubjects.push(providerSubject);
    await database.client.authIdentity.create({
      data: {
        provider: "SUPABASE",
        providerSubject,
        userId: user.id,
      },
    });

    return {
      userId: user.id,
      principal: {
        provider: "SUPABASE",
        providerSubject,
      } satisfies AuthenticatedPrincipal,
    };
  };

  const createRole = async (
    scopeKind: "PLATFORM" | "UNIVERSITY",
    label: string,
  ) => {
    const role = await database.client.role.create({
      data: {
        key: `${label}-${suffix}`,
        name: `Test ${label}`,
        scopeKind,
      },
    });
    roleIds.push(role.id);
    return role;
  };

  const createUniversity = async (label: string) => {
    const university = await database.client.university.create({
      data: {
        name: `Phase 6 authorization ${label} ${suffix}`,
        slug: `phase6-authz-${label}-${suffix}`,
      },
    });
    universityIds.push(university.id);
    return university;
  };

  try {
    const physicalTables = await database.client.$queryRaw<
      Array<{ tableName: string }>
    >`
      SELECT tablename AS "tableName"
      FROM pg_tables
      WHERE schemaname = 'app'
        AND tablename IN (
          'roles',
          'role_capabilities',
          'role_assignments',
          'capability_assignments'
        )
      ORDER BY tablename
    `;
    assert.deepEqual(
      physicalTables.map(({ tableName }) => tableName),
      [
        "capability_assignments",
        "role_assignments",
        "role_capabilities",
        "roles",
      ].sort(),
    );

    const scopeChecks = await database.client.$queryRaw<
      Array<{ tableName: string; definition: string }>
    >`
      SELECT
        constraint_row.conrelid::regclass::text AS "tableName",
        pg_get_constraintdef(constraint_row.oid) AS definition
      FROM pg_constraint AS constraint_row
      WHERE constraint_row.connamespace = 'app'::regnamespace
        AND constraint_row.contype = 'c'
        AND constraint_row.conrelid IN (
          'app.role_assignments'::regclass,
          'app.capability_assignments'::regclass
        )
      ORDER BY constraint_row.conname
    `;
    assert.equal(scopeChecks.length, 2);
    assert.ok(
      scopeChecks.every(
        ({ definition }) =>
          definition.includes("PLATFORM") &&
          definition.includes("UNIVERSITY") &&
          definition.includes("university_id"),
      ),
    );

    const roleScopeForeignKeys = await database.client.$queryRaw<
      Array<{ definition: string }>
    >`
      SELECT pg_get_constraintdef(constraint_row.oid) AS definition
      FROM pg_constraint AS constraint_row
      WHERE constraint_row.connamespace = 'app'::regnamespace
        AND constraint_row.contype = 'f'
        AND constraint_row.conrelid = 'app.role_assignments'::regclass
        AND constraint_row.confrelid = 'app.roles'::regclass
    `;
    assert.equal(roleScopeForeignKeys.length, 1);
    assert.ok(
      roleScopeForeignKeys[0]?.definition
        .replaceAll('"', "")
        .replace(/\s+/g, " ")
        .includes(
          "FOREIGN KEY (role_id, scope_kind) REFERENCES app.roles(id, scope_kind)",
        ),
    );

    const universityForeignKeys = await database.client.$queryRaw<
      Array<{ deleteAction: string }>
    >`
      SELECT constraint_row.confdeltype::text AS "deleteAction"
      FROM pg_constraint AS constraint_row
      WHERE constraint_row.connamespace = 'app'::regnamespace
        AND constraint_row.contype = 'f'
        AND constraint_row.confrelid = 'app.universities'::regclass
        AND constraint_row.conrelid IN (
          'app.role_assignments'::regclass,
          'app.capability_assignments'::regclass
        )
    `;
    assert.equal(universityForeignKeys.length, 2);
    assert.ok(
      universityForeignKeys.every(({ deleteAction }) => deleteAction === "c"),
    );

    const unmappedPrincipal: AuthenticatedPrincipal = {
      provider: "SUPABASE",
      providerSubject: `phase6-authorization-unmapped:${suffix}`,
    };
    assert.equal(
      await service.can(
        unmappedPrincipal,
        Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
        { kind: AuthorizationScopeKinds.PLATFORM },
      ),
      false,
    );
    assert.equal(
      await database.client.authIdentity.findUnique({
        where: {
          provider_providerSubject: {
            provider: "SUPABASE",
            providerSubject: unmappedPrincipal.providerSubject,
          },
        },
      }),
      null,
    );

    const directActor = await createUser("direct");
    const directPlatformAssignment = {
      userId: directActor.userId,
      capability: Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
      scopeKind: AuthorizationScopeKinds.PLATFORM,
      universityId: null,
    };
    await database.client.capabilityAssignment.create({
      data: directPlatformAssignment,
    });
    assert.equal(
      await service.can(
        directActor.principal,
        Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
        { kind: "PLATFORM" },
      ),
      true,
    );
    assert.equal(
      await service.can(
        directActor.principal,
        Capabilities.UNIVERSITY_AUTHORIZATION_MANAGE,
        { kind: "PLATFORM" },
      ),
      false,
    );
    await assert.rejects(
      () =>
        database.client.capabilityAssignment.create({
          data: directPlatformAssignment,
        }),
      isUniqueConstraintViolation,
    );

    const roleActor = await createUser("role-derived");
    const role = await createRole("PLATFORM", "flexible-operations-bundle");
    await database.client.roleCapability.create({
      data: {
        roleId: role.id,
        capability: Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
      },
    });
    await database.client.roleAssignment.create({
      data: {
        userId: roleActor.userId,
        roleId: role.id,
        scopeKind: "PLATFORM",
        universityId: null,
      },
    });
    assert.equal(
      await service.can(
        roleActor.principal,
        Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
        { kind: "PLATFORM" },
      ),
      true,
    );
    await assert.rejects(
      () =>
        database.client.roleCapability.create({
          data: {
            roleId: role.id,
            capability: Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
          },
        }),
      isUniqueConstraintViolation,
    );

    const roleNameOnlyActor = await createUser("role-name-only");
    const roleNamedAdmin = await createRole("PLATFORM", "admin");
    await database.client.roleAssignment.create({
      data: {
        userId: roleNameOnlyActor.userId,
        roleId: roleNamedAdmin.id,
        scopeKind: "PLATFORM",
        universityId: null,
      },
    });
    assert.equal(
      await service.can(
        roleNameOnlyActor.principal,
        Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
        { kind: "PLATFORM" },
      ),
      false,
    );

    const unknownActor = await createUser("unknown-stored-capability");
    const unknownRole = await createRole("PLATFORM", "unknown-capabilities");
    await database.client.roleCapability.create({
      data: {
        roleId: unknownRole.id,
        capability: "platform.unknown.manage",
      },
    });
    await database.client.roleAssignment.create({
      data: {
        userId: unknownActor.userId,
        roleId: unknownRole.id,
        scopeKind: "PLATFORM",
        universityId: null,
      },
    });
    await database.client.capabilityAssignment.create({
      data: {
        userId: unknownActor.userId,
        capability: "platform.unknown.direct",
        scopeKind: "PLATFORM",
        universityId: null,
      },
    });
    assert.equal(
      await service.can(
        unknownActor.principal,
        Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
        { kind: "PLATFORM" },
      ),
      false,
    );

    assert.equal(
      await service.can(
        unknownActor.principal,
        // @ts-expect-error Unknown runtime keys are rejected by the typed API.
        "platform.unknown.manage",
        { kind: "PLATFORM" },
      ),
      false,
    );

    const universityA = await createUniversity("a");
    const universityB = await createUniversity("b");
    const universityActor = await createUser("university-role");
    const universityRole = await createRole(
      "UNIVERSITY",
      "local-authorization",
    );
    await database.client.roleCapability.create({
      data: {
        roleId: universityRole.id,
        capability: Capabilities.UNIVERSITY_AUTHORIZATION_MANAGE,
      },
    });
    const universityRoleAssignment = {
      userId: universityActor.userId,
      roleId: universityRole.id,
      scopeKind: "UNIVERSITY" as const,
      universityId: universityA.id,
    };
    await database.client.roleAssignment.create({
      data: universityRoleAssignment,
    });
    assert.equal(
      await service.can(
        universityActor.principal,
        Capabilities.UNIVERSITY_AUTHORIZATION_MANAGE,
        { kind: "UNIVERSITY", universityId: universityA.id },
      ),
      true,
    );
    assert.equal(
      await service.can(
        universityActor.principal,
        Capabilities.UNIVERSITY_AUTHORIZATION_MANAGE,
        { kind: "UNIVERSITY", universityId: universityB.id },
      ),
      false,
    );
    assert.equal(
      await service.can(
        universityActor.principal,
        Capabilities.UNIVERSITY_AUTHORIZATION_MANAGE,
        { kind: "PLATFORM" },
      ),
      false,
    );
    await assert.rejects(
      () =>
        database.client.roleAssignment.create({
          data: universityRoleAssignment,
        }),
      isUniqueConstraintViolation,
    );

    const universityDirectActor = await createUser("university-direct");
    const universityDirectAssignment = {
      userId: universityDirectActor.userId,
      capability: Capabilities.UNIVERSITY_AUTHORIZATION_MANAGE,
      scopeKind: "UNIVERSITY" as const,
      universityId: universityA.id,
    };
    await database.client.capabilityAssignment.create({
      data: universityDirectAssignment,
    });
    assert.equal(
      await service.can(
        universityDirectActor.principal,
        Capabilities.UNIVERSITY_AUTHORIZATION_MANAGE,
        { kind: "UNIVERSITY", universityId: universityA.id },
      ),
      true,
    );
    assert.equal(
      await service.can(
        universityDirectActor.principal,
        Capabilities.UNIVERSITY_AUTHORIZATION_MANAGE,
        { kind: "UNIVERSITY", universityId: universityB.id },
      ),
      false,
    );
    await assert.rejects(
      () =>
        database.client.capabilityAssignment.create({
          data: universityDirectAssignment,
        }),
      isUniqueConstraintViolation,
    );

    const mismatchedRoleActor = await createUser("role-scope-mismatch");
    const platformRole = await createRole("PLATFORM", "mismatched-role");
    await database.client.roleCapability.create({
      data: {
        roleId: platformRole.id,
        capability: Capabilities.UNIVERSITY_AUTHORIZATION_MANAGE,
      },
    });
    await assert.rejects(
      () =>
        database.client.roleAssignment.create({
          data: {
            userId: mismatchedRoleActor.userId,
            roleId: platformRole.id,
            scopeKind: "UNIVERSITY",
            universityId: universityA.id,
          },
        }),
      isForeignKeyConstraintViolation,
    );
    assert.equal(
      await service.can(
        mismatchedRoleActor.principal,
        Capabilities.UNIVERSITY_AUTHORIZATION_MANAGE,
        { kind: "UNIVERSITY", universityId: universityA.id },
      ),
      false,
    );

    const mismatchedCapabilityActor = await createUser(
      "capability-scope-mismatch",
    );
    await database.client.capabilityAssignment.create({
      data: {
        userId: mismatchedCapabilityActor.userId,
        capability: Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
        scopeKind: "UNIVERSITY",
        universityId: universityA.id,
      },
    });
    assert.equal(
      await service.can(
        mismatchedCapabilityActor.principal,
        Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
        { kind: "UNIVERSITY", universityId: universityA.id },
      ),
      false,
    );
    assert.equal(
      await service.can(
        mismatchedCapabilityActor.principal,
        Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
        { kind: "PLATFORM" },
      ),
      false,
    );

    const invalidScopeActor = await createUser("invalid-scope-check");
    const invalidScopeRole = await createRole("PLATFORM", "invalid-scope");
    for (const invalidAssignment of [
      {
        scopeKind: "PLATFORM" as const,
        universityId: universityA.id,
      },
      {
        scopeKind: "UNIVERSITY" as const,
        universityId: null,
      },
    ]) {
      await assert.rejects(() =>
        database.client.roleAssignment.create({
          data: {
            userId: invalidScopeActor.userId,
            roleId: invalidScopeRole.id,
            ...invalidAssignment,
          },
        }),
      );
      await assert.rejects(() =>
        database.client.capabilityAssignment.create({
          data: {
            userId: invalidScopeActor.userId,
            capability: Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
            ...invalidAssignment,
          },
        }),
      );
    }

    const deletionActor = await createUser("user-cascade");
    const deletionRole = await createRole("PLATFORM", "user-cascade");
    await database.client.roleCapability.create({
      data: {
        roleId: deletionRole.id,
        capability: Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
      },
    });
    await database.client.roleAssignment.create({
      data: {
        userId: deletionActor.userId,
        roleId: deletionRole.id,
        scopeKind: "PLATFORM",
        universityId: null,
      },
    });
    await database.client.capabilityAssignment.create({
      data: {
        userId: deletionActor.userId,
        capability: Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
        scopeKind: "PLATFORM",
        universityId: null,
      },
    });
    await database.client.user.delete({
      where: { id: deletionActor.userId },
    });
    assert.equal(
      await database.client.authIdentity.count({
        where: { providerSubject: deletionActor.principal.providerSubject },
      }),
      0,
    );
    assert.equal(
      await database.client.roleAssignment.count({
        where: { userId: deletionActor.userId },
      }),
      0,
    );
    assert.equal(
      await database.client.capabilityAssignment.count({
        where: { userId: deletionActor.userId },
      }),
      0,
    );

    const roleCascadeActor = await createUser("role-cascade");
    const roleCascade = await createRole("PLATFORM", "role-cascade");
    await database.client.roleCapability.create({
      data: {
        roleId: roleCascade.id,
        capability: Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
      },
    });
    await database.client.roleAssignment.create({
      data: {
        userId: roleCascadeActor.userId,
        roleId: roleCascade.id,
        scopeKind: "PLATFORM",
        universityId: null,
      },
    });
    await database.client.role.delete({ where: { id: roleCascade.id } });
    assert.equal(
      await database.client.roleCapability.count({
        where: { roleId: roleCascade.id },
      }),
      0,
    );
    assert.equal(
      await database.client.roleAssignment.count({
        where: { roleId: roleCascade.id },
      }),
      0,
    );

    const universityCascade = await createUniversity("cascade");
    const universityCascadeActor = await createUser("university-cascade");
    const universityCascadeRole = await createRole(
      "UNIVERSITY",
      "university-cascade",
    );
    await database.client.roleCapability.create({
      data: {
        roleId: universityCascadeRole.id,
        capability: Capabilities.UNIVERSITY_AUTHORIZATION_MANAGE,
      },
    });
    await database.client.roleAssignment.create({
      data: {
        userId: universityCascadeActor.userId,
        roleId: universityCascadeRole.id,
        scopeKind: "UNIVERSITY",
        universityId: universityCascade.id,
      },
    });
    await database.client.capabilityAssignment.create({
      data: {
        userId: universityCascadeActor.userId,
        capability: Capabilities.UNIVERSITY_AUTHORIZATION_MANAGE,
        scopeKind: "UNIVERSITY",
        universityId: universityCascade.id,
      },
    });
    await database.client.university.delete({
      where: { id: universityCascade.id },
    });
    assert.equal(
      await database.client.roleAssignment.count({
        where: { universityId: universityCascade.id },
      }),
      0,
    );
    assert.equal(
      await database.client.capabilityAssignment.count({
        where: { universityId: universityCascade.id },
      }),
      0,
    );
  } finally {
    try {
      await database.client.user.deleteMany({
        where: { id: { in: userIds } },
      });
      await database.client.role.deleteMany({
        where: { id: { in: roleIds } },
      });
      await database.client.university.deleteMany({
        where: { id: { in: universityIds } },
      });
    } finally {
      await database.onModuleDestroy();
    }
  }
});

test("feature-local resource policy can deny an actor with a coarse capability", async () => {
  const database = new DatabaseClientService({
    connectionString: databaseUrl,
  });
  const authorization = new AuthorizationService(database);
  const resourceService = new TestOnlyOwnedDraftResourceService(authorization);
  const suffix = randomUUID();
  const userIds: string[] = [];

  try {
    const user = await database.client.user.create({ data: {} });
    userIds.push(user.id);
    const principal: AuthenticatedPrincipal = {
      provider: "SUPABASE",
      providerSubject: `phase6-resource-policy:${suffix}`,
    };
    await database.client.authIdentity.create({
      data: {
        provider: principal.provider,
        providerSubject: principal.providerSubject,
        userId: user.id,
      },
    });
    await database.client.capabilityAssignment.create({
      data: {
        userId: user.id,
        capability: Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
        scopeKind: "PLATFORM",
        universityId: null,
      },
    });

    assert.equal(
      await authorization.can(
        principal,
        Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
        { kind: "PLATFORM" },
      ),
      true,
    );

    let operationProceeded = false;
    await assert.rejects(
      () =>
        resourceService.updateDraft(
          principal,
          user.id,
          {
            ownerId: `another-user:${suffix}`,
            lifecycle: "DRAFT",
          },
          () => {
            operationProceeded = true;
          },
        ),
      /Feature-local resource policy denied/,
    );
    assert.equal(operationProceeded, false);
  } finally {
    try {
      await database.client.user.deleteMany({
        where: { id: { in: userIds } },
      });
    } finally {
      await database.onModuleDestroy();
    }
  }
});
