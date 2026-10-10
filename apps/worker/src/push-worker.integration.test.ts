import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createDatabaseClient } from "@unimate/database";
import {
  FOUNDATION_PUSH_RECEIPT_CHECK_JOB_TYPE,
  FOUNDATION_PUSH_SEND_JOB_TYPE,
  foundationPushReceiptCheckPayloadSchema,
  foundationPushSendPayloadSchema,
  jobEnvelopeSchema,
} from "@unimate/jobs";
import {
  parsePushSubmissionHandle,
  type PushMessage,
  type PushProvider,
} from "@unimate/notifications";
import { withSupabaseTestQueue } from "@unimate/queue/supabase-test-support";
import { trace } from "@opentelemetry/api";
import type {
  TelemetryProvider,
  TracePropagationContext,
} from "@unimate/observability";
import { processQueueMessage as processQueueMessageImpl } from "./consumer.js";
import {
  createFoundationPushReceiptCheckHandler,
  createFoundationPushSendHandler,
} from "./foundation-push-handlers.js";
import { dispatchOutboxBatch as dispatchOutboxBatchImpl } from "./outbox-dispatcher.js";
import { createJobHandlerRegistry } from "./registry.js";
import { PrismaPushDeliveryRepository } from "./push-delivery-repository.js";
import { createTestObservability } from "./test-support/observability.js";

const databaseUrl = process.env["DATABASE_URL"];
const queueDatabaseUrl = process.env["SUPABASE_TEST_DATABASE_URL"];

if (databaseUrl === undefined || queueDatabaseUrl === undefined) {
  throw new Error(
    "Local DATABASE_URL and SUPABASE_TEST_DATABASE_URL are required for the push worker integration test.",
  );
}

const testObservability = createTestObservability();
type TestObservability = Pick<
  ReturnType<typeof createTestObservability>,
  "executionContext" | "logger" | "errorReporter"
>;
const telemetry: TelemetryProvider = {
  runInSpan({ name, attributes, operation }) {
    const span = trace
      .getTracer("unimate-push-worker-integration-tests")
      .startSpan(name, attributes === undefined ? {} : { attributes });
    return Promise.resolve()
      .then(() => operation(span))
      .finally(() => span.end());
  },
  capturePropagationContext(): TracePropagationContext | undefined {
    return undefined;
  },
  async runWithPropagationContext(_context, operation) {
    return await operation();
  },
  runWithActiveSpan(_span, operation) {
    return operation();
  },
};

function processQueueMessage(
  input: Omit<
    Parameters<typeof processQueueMessageImpl>[0],
    keyof TestObservability
  >,
) {
  return processQueueMessageImpl({ ...input, ...testObservability });
}

function dispatchOutboxBatch(
  input: Omit<
    Parameters<typeof dispatchOutboxBatchImpl>[0],
    keyof TestObservability
  >,
) {
  return dispatchOutboxBatchImpl({ ...input, ...testObservability });
}

test(
  "dispatches a push proof through Outbox, local PGMQ, and provider-neutral worker handlers",
  { timeout: 30_000 },
  async () => {
    const database = createDatabaseClient({ connectionString: databaseUrl });
    let connected = false;
    let userId: string | undefined;
    let outboxId: string | undefined;

    try {
      await database.$connect();
      connected = true;

      const user = await database.user.create({ data: {} });
      userId = user.id;
      const providerToken = `synthetic-worker-token:${randomUUID()}`;
      const registration = await database.pushRegistration.create({
        data: {
          userId,
          provider: "EXPO",
          platform: "IOS",
          providerToken,
        },
      });
      const outbox = await database.outboxMessage.create({
        data: {
          eventType: FOUNDATION_PUSH_SEND_JOB_TYPE,
          payloadVersion: 1,
          payload: { registrationId: registration.id },
        },
      });
      outboxId = outbox.id;

      const sentMessages: PushMessage[] = [];
      const checkedHandles: string[] = [];
      const pushProvider: PushProvider = {
        async send(message) {
          sentMessages.push(message);
          return {
            handle: parsePushSubmissionHandle("local-synthetic-ticket"),
          };
        },
        async checkReceipt(handle) {
          checkedHandles.push(handle);
          return { status: "accepted" };
        },
      };
      const repository = new PrismaPushDeliveryRepository(database);
      const queueName = `phase10-push-${randomUUID().replaceAll("-", "")}`;

      await withSupabaseTestQueue(
        { connectionString: queueDatabaseUrl, queueName },
        async (queue) => {
          const registry = createJobHandlerRegistry([
            createFoundationPushSendHandler({
              repository,
              queue,
              pushProvider,
              receiptCheckDelaySeconds: 0,
            }),
            createFoundationPushReceiptCheckHandler({
              repository,
              pushProvider,
            }),
          ]);

          assert.equal(
            await dispatchOutboxBatch({
              database,
              queue,
              telemetry,
              limit: 1,
            }),
            1,
          );

          const sendMessage = (
            await queue.receive({ visibilityTimeoutSeconds: 0, limit: 1 })
          )[0];
          assert.ok(sendMessage);
          const sendEnvelope = jobEnvelopeSchema.parse(sendMessage.payload);
          assert.equal(sendEnvelope.id, outbox.id);
          assert.equal(sendEnvelope.type, FOUNDATION_PUSH_SEND_JOB_TYPE);
          assert.deepEqual(
            foundationPushSendPayloadSchema.parse(sendEnvelope.payload),
            { registrationId: registration.id },
          );
          assert.equal(
            JSON.stringify(sendEnvelope).includes(providerToken),
            false,
          );
          assert.equal(
            await processQueueMessage({
              message: sendMessage,
              queue,
              telemetry,
              registry,
              maximumAttempts: 5,
            }),
            "acknowledged",
          );

          const attempt = await database.pushDeliveryAttempt.findUniqueOrThrow({
            where: { sourceJobId: outbox.id },
          });
          assert.match(
            attempt.id,
            /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          );
          assert.equal(attempt.submissionHandle, "local-synthetic-ticket");

          const receiptMessage = (
            await queue.receive({ visibilityTimeoutSeconds: 0, limit: 1 })
          )[0];
          assert.ok(receiptMessage);
          const receiptEnvelope = jobEnvelopeSchema.parse(
            receiptMessage.payload,
          );
          assert.equal(
            receiptEnvelope.type,
            FOUNDATION_PUSH_RECEIPT_CHECK_JOB_TYPE,
          );
          assert.deepEqual(
            foundationPushReceiptCheckPayloadSchema.parse(
              receiptEnvelope.payload,
            ),
            { deliveryAttemptId: attempt.id },
          );
          assert.equal(
            JSON.stringify(receiptEnvelope).includes("local-synthetic-ticket"),
            false,
          );
          assert.equal(
            await processQueueMessage({
              message: receiptMessage,
              queue,
              telemetry,
              registry,
              maximumAttempts: 5,
            }),
            "acknowledged",
          );

          const acceptedAttempt =
            await database.pushDeliveryAttempt.findUniqueOrThrow({
              where: { id: attempt.id },
            });
          assert.equal(acceptedAttempt.status, "RECEIPT_ACCEPTED");
          assert.deepEqual(checkedHandles, ["local-synthetic-ticket"]);
          assert.equal(sentMessages.length, 1);
          assert.equal(sentMessages[0]?.destinationToken, providerToken);
          assert.equal(sentMessages[0]?.title, "UniMate push proof");
          assert.equal(
            sentMessages[0]?.body,
            "Push notification delivery is working.",
          );
        },
      );
    } finally {
      if (connected) {
        if (outboxId !== undefined) {
          await database.outboxMessage.deleteMany({ where: { id: outboxId } });
        }
        if (userId !== undefined) {
          await database.user.deleteMany({ where: { id: userId } });
        }
      }
      await database.$disconnect();
    }
  },
);
