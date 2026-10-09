-- CreateEnum
CREATE TYPE "stored_object_status" AS ENUM ('PENDING', 'READY');

-- CreateTable
CREATE TABLE "stored_objects" (
    "id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "creator_user_id" UUID NOT NULL,
    "content_type" TEXT NOT NULL,
    "status" "stored_object_status" NOT NULL DEFAULT 'PENDING',
    "size_bytes" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "stored_objects_pkey" PRIMARY KEY ("id")
);

-- Add a lifecycle invariant Prisma cannot express
ALTER TABLE "stored_objects"
ADD CONSTRAINT "stored_objects_lifecycle_valid" CHECK (
    ("status" = 'PENDING' AND "size_bytes" IS NULL AND "completed_at" IS NULL)
    OR (
        "status" = 'READY'
        AND "size_bytes" IS NOT NULL
        AND "size_bytes" > 0
        AND "completed_at" IS NOT NULL
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "stored_objects_object_key_key" ON "stored_objects"("object_key");

-- CreateIndex
CREATE INDEX "stored_objects_creator_user_id_idx" ON "stored_objects"("creator_user_id");

-- AddForeignKey
ALTER TABLE "stored_objects" ADD CONSTRAINT "stored_objects_creator_user_id_fkey" FOREIGN KEY ("creator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
