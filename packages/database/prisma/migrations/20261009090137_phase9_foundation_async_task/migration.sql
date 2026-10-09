-- CreateTable
CREATE TABLE "foundation_async_tasks" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "foundation_async_tasks_pkey" PRIMARY KEY ("id")
);
