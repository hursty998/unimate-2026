/*
  Warnings:

  - A unique constraint covering the columns `[id,scope_kind]` on the table `roles` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "role_assignments" DROP CONSTRAINT "role_assignments_role_id_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "roles_id_scope_kind_key" ON "roles"("id", "scope_kind");

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_id_scope_kind_fkey" FOREIGN KEY ("role_id", "scope_kind") REFERENCES "roles"("id", "scope_kind") ON DELETE CASCADE ON UPDATE CASCADE;
