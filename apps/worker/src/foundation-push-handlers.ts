import { randomUUID } from "node:crypto";
import {
  FOUNDATION_PUSH_RECEIPT_CHECK_JOB_TYPE,
  FOUNDATION_PUSH_SEND_JOB_TYPE,
  foundationPushReceiptCheckPayloadSchema,
  foundationPushSendPayloadSchema,
  type JobEnvelope,
} from "@unimate/jobs";
import {
  parsePushSubmissionHandle,
  PushProviderError,
  type PushProvider,
} from "@unimate/notifications";
import type { JobQueue } from "@unimate/queue";
import { PermanentJobError } from "./permanent-job-error.js";
import {
  type PushDeliveryAttemptRecord,
  type PushDeliveryRepository,
} from "./push-delivery-repository.js";
import { registerJobHandler, type RegisteredJobHandler } from "./registry.js";

export const FOUNDATION_PUSH_RECEIPT_CHECK_DELAY_SECONDS = 15 * 60;

const FOUNDATION_PUSH_TITLE = "UniMate push proof";
const FOUNDATION_PUSH_BODY = "Push notification delivery is working.";

function isTerminalAttempt(attempt: PushDeliveryAttemptRecord): boolean {
  return attempt.status !== "SUBMITTED";
}

async function ensureReceiptCheckScheduled({
  attempt,
  repository,
  queue,
  delaySeconds,
}: {
  readonly attempt: PushDeliveryAttemptRecord;
  readonly repository: PushDeliveryRepository;
  readonly queue: JobQueue;
  readonly delaySeconds: number;
}): Promise<void> {
  if (
    attempt.status !== "SUBMITTED" ||
    attempt.submissionHandle === null ||
    attempt.receiptCheckScheduledAt !== null
  ) {
    return;
  }

  const envelope = {
    id: randomUUID(),
    type: FOUNDATION_PUSH_RECEIPT_CHECK_JOB_TYPE,
    version: 1,
    payload: { deliveryAttemptId: attempt.id },
  } satisfies JobEnvelope;

  await queue.enqueue(envelope, { delaySeconds });
  await repository.markReceiptCheckScheduled(attempt.id, new Date());
}

export function createFoundationPushSendHandler({
  repository,
  queue,
  pushProvider,
  receiptCheckDelaySeconds = FOUNDATION_PUSH_RECEIPT_CHECK_DELAY_SECONDS,
}: {
  readonly repository: PushDeliveryRepository;
  readonly queue: JobQueue;
  readonly pushProvider: PushProvider;
  readonly receiptCheckDelaySeconds?: number;
}): RegisteredJobHandler {
  if (
    !Number.isSafeInteger(receiptCheckDelaySeconds) ||
    receiptCheckDelaySeconds < 0
  ) {
    throw new TypeError(
      "Push receipt check delay must be a non-negative integer.",
    );
  }

  return registerJobHandler({
    type: FOUNDATION_PUSH_SEND_JOB_TYPE,
    version: 1,
    payloadSchema: foundationPushSendPayloadSchema,
    async handle({ id, payload }) {
      const previousAttempt = await repository.findAttemptBySourceJobId(id);

      if (previousAttempt !== null) {
        if (previousAttempt.status === "REJECTED") {
          throw new PermanentJobError(
            "The push provider permanently rejected the foundation proof.",
          );
        }

        if (isTerminalAttempt(previousAttempt)) {
          return;
        }

        if (previousAttempt.submissionHandle === null) {
          throw new PermanentJobError(
            "A submitted push attempt is missing its provider handle.",
          );
        }

        await ensureReceiptCheckScheduled({
          attempt: previousAttempt,
          repository,
          queue,
          delaySeconds: receiptCheckDelaySeconds,
        });
        return;
      }

      const registration = await repository.findRegistration(
        payload.registrationId,
      );

      if (registration === null) {
        return;
      }

      if (registration.status !== "ACTIVE") {
        await repository.recordDisabledSkip(id, registration.id);
        return;
      }

      let submission;
      try {
        submission = await pushProvider.send({
          destinationToken: registration.providerToken,
          title: FOUNDATION_PUSH_TITLE,
          body: FOUNDATION_PUSH_BODY,
        });
      } catch (error) {
        if (!(error instanceof PushProviderError)) {
          throw error;
        }

        if (error.kind === "transient") {
          throw error;
        }

        if (error.kind === "invalid-token") {
          await repository.recordInvalidToken(id, registration.id);
          return;
        }

        await repository.recordRejectedSend(id, registration.id);
        throw new PermanentJobError(
          "The push provider permanently rejected the foundation proof.",
        );
      }

      const attempt = await repository.createSubmittedAttempt({
        sourceJobId: id,
        registrationId: registration.id,
        submissionHandle: submission.handle,
      });

      await ensureReceiptCheckScheduled({
        attempt,
        repository,
        queue,
        delaySeconds: receiptCheckDelaySeconds,
      });
    },
  });
}

export function createFoundationPushReceiptCheckHandler({
  repository,
  pushProvider,
}: {
  readonly repository: PushDeliveryRepository;
  readonly pushProvider: PushProvider;
}): RegisteredJobHandler {
  return registerJobHandler({
    type: FOUNDATION_PUSH_RECEIPT_CHECK_JOB_TYPE,
    version: 1,
    payloadSchema: foundationPushReceiptCheckPayloadSchema,
    async handle({ payload }) {
      const attempt = await repository.findAttemptById(
        payload.deliveryAttemptId,
      );

      if (attempt === null) {
        throw new PermanentJobError(
          "The push delivery attempt does not exist.",
        );
      }

      if (attempt.status === "REJECTED") {
        throw new PermanentJobError(
          "The push provider permanently rejected the submitted notification.",
        );
      }

      if (isTerminalAttempt(attempt)) {
        return;
      }

      if (attempt.submissionHandle === null) {
        throw new PermanentJobError(
          "The push delivery attempt has no provider submission handle.",
        );
      }

      let receipt;
      try {
        receipt = await pushProvider.checkReceipt(
          parsePushSubmissionHandle(attempt.submissionHandle),
        );
      } catch (error) {
        if (!(error instanceof PushProviderError)) {
          throw error;
        }

        if (error.kind === "transient") {
          throw error;
        }

        if (error.kind === "invalid-token") {
          await repository.markReceiptInvalidToken(
            attempt.id,
            attempt.registrationId,
            new Date(),
          );
          return;
        }

        await repository.markReceiptRejected(attempt.id, new Date());
        throw new PermanentJobError(
          "The push provider permanently rejected the submitted notification.",
        );
      }

      if (receipt.status === "pending") {
        throw new Error("The push receipt is not available yet.");
      }

      await repository.markReceiptAccepted(attempt.id, new Date());
    },
  });
}
