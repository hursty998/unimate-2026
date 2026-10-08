-- CreateEnum
CREATE TYPE "authorization_scope_kind" AS ENUM ('PLATFORM', 'UNIVERSITY');

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope_kind" "authorization_scope_kind" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_capabilities" (
    "role_id" UUID NOT NULL,
    "capability" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_capabilities_pkey" PRIMARY KEY ("role_id","capability")
);

-- CreateTable
CREATE TABLE "role_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "scope_kind" "authorization_scope_kind" NOT NULL,
    "university_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capability_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "capability" TEXT NOT NULL,
    "scope_kind" "authorization_scope_kind" NOT NULL,
    "university_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capability_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_scope_kind_key_key" ON "roles"("scope_kind", "key");

-- CreateIndex
CREATE INDEX "role_assignments_user_id_scope_kind_university_id_role_id_idx" ON "role_assignments"("user_id", "scope_kind", "university_id", "role_id");

-- CreateIndex
CREATE INDEX "role_assignments_role_id_idx" ON "role_assignments"("role_id");

-- CreateIndex
CREATE INDEX "role_assignments_university_id_idx" ON "role_assignments"("university_id");

-- CreateIndex
CREATE INDEX "capability_assignments_user_id_scope_kind_university_id_cap_idx" ON "capability_assignments"("user_id", "scope_kind", "university_id", "capability");

-- CreateIndex
CREATE INDEX "capability_assignments_university_id_idx" ON "capability_assignments"("university_id");

-- AddForeignKey
ALTER TABLE "role_capabilities" ADD CONSTRAINT "role_capabilities_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capability_assignments" ADD CONSTRAINT "capability_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capability_assignments" ADD CONSTRAINT "capability_assignments_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep persisted scope identifiers aligned with the real University foreign key.
ALTER TABLE "app"."role_assignments"
ADD CONSTRAINT "role_assignments_scope_university_consistency_check"
CHECK (
    ("scope_kind" = 'PLATFORM' AND "university_id" IS NULL)
    OR
    ("scope_kind" = 'UNIVERSITY' AND "university_id" IS NOT NULL)
);

ALTER TABLE "app"."capability_assignments"
ADD CONSTRAINT "capability_assignments_scope_university_consistency_check"
CHECK (
    ("scope_kind" = 'PLATFORM' AND "university_id" IS NULL)
    OR
    ("scope_kind" = 'UNIVERSITY' AND "university_id" IS NOT NULL)
);

-- PostgreSQL treats NULLs as distinct in ordinary unique indexes.
CREATE UNIQUE INDEX "role_assignments_platform_assignment_unique"
ON "app"."role_assignments" ("user_id", "role_id")
WHERE "scope_kind" = 'PLATFORM';

CREATE UNIQUE INDEX "role_assignments_university_assignment_unique"
ON "app"."role_assignments" ("user_id", "role_id", "university_id")
WHERE "scope_kind" = 'UNIVERSITY';

CREATE UNIQUE INDEX "capability_assignments_platform_assignment_unique"
ON "app"."capability_assignments" ("user_id", "capability")
WHERE "scope_kind" = 'PLATFORM';

CREATE UNIQUE INDEX "capability_assignments_university_assignment_unique"
ON "app"."capability_assignments" ("user_id", "capability", "university_id")
WHERE "scope_kind" = 'UNIVERSITY';
