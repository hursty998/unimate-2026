ALTER TABLE "app"."outbox_messages"
ADD COLUMN "correlation_id" UUID,
ADD COLUMN "traceparent" VARCHAR(55),
ADD COLUMN "tracestate" VARCHAR(512);

UPDATE "app"."outbox_messages"
SET "correlation_id" = gen_random_uuid()
WHERE "correlation_id" IS NULL;

ALTER TABLE "app"."outbox_messages"
ALTER COLUMN "correlation_id" SET NOT NULL;
