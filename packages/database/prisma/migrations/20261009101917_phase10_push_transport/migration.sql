-- CreateEnum
CREATE TYPE "push_provider_kind" AS ENUM ('EXPO');

-- CreateEnum
CREATE TYPE "push_platform" AS ENUM ('IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "push_registration_status" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "push_delivery_status" AS ENUM ('SUBMITTED', 'RECEIPT_ACCEPTED', 'INVALID_TOKEN', 'REJECTED', 'SKIPPED_DISABLED');

-- CreateTable
CREATE TABLE "push_registrations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "push_provider_kind" NOT NULL,
    "platform" "push_platform" NOT NULL,
    "provider_token" TEXT NOT NULL,
    "status" "push_registration_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "push_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_delivery_attempts" (
    "id" UUID NOT NULL,
    "source_job_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "submission_handle" TEXT,
    "status" "push_delivery_status" NOT NULL,
    "receipt_check_scheduled_at" TIMESTAMPTZ(6),
    "receipt_checked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "push_registrations_user_id_status_idx" ON "push_registrations"("user_id", "status");

-- Prisma cannot model partial uniqueness; disabled history must not block a new active registration.
CREATE UNIQUE INDEX "push_registrations_active_provider_token_key" ON "push_registrations"("provider", "provider_token") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "push_delivery_attempts_source_job_id_key" ON "push_delivery_attempts"("source_job_id");

-- CreateIndex
CREATE INDEX "push_delivery_attempts_registration_id_idx" ON "push_delivery_attempts"("registration_id");

-- AddForeignKey
ALTER TABLE "push_registrations" ADD CONSTRAINT "push_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_delivery_attempts" ADD CONSTRAINT "push_delivery_attempts_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "push_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
