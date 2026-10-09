import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { jobEnvelopeSchema } from "@unimate/jobs";
import {
  FOUNDATION_PUSH_RECEIPT_CHECK_DELAY_SECONDS,
  createFoundationPushReceiptCheckHandler,
  createFoundationPushSendHandler,
} from "./foundation-push-handlers.js";
import { PermanentJobError } from "./permanent-job-error.js";
import {
  type PushDeliveryAttemptRecord,
  type PushDeliveryRepository,
  type PushRegistrationForDelivery,
} from "./push-delivery-repository.js";
import {
  parsePushSubmissionHandle,
  PushProviderError,
  type PushMessage,
  type PushProvider,
  type PushReceiptResult,
} from "@unimate/notifications";
import type { JobQueue, JsonValue, QueueMessageId } from "@unimate/queue";

const registrationId = "0199f4ad-6789-7abc-8def-0123456789ab";
const sourceJobId = "0199f4ad-6789-7abc-8def-1123456789ab";
const deliveryAttemptId = "0199f4ad-6789-7abc-8def-2123456789ab";
const providerHandle = parsePushSubmissionHandle("opaque-provider-handle");

function activeRegistration(
  overrides: Partial<PushRegistrationForDelivery> = {},
): PushRegistrationForDelivery {
  return {
    id: registrationId,
    provider: "EXPO",
    platform: "IOS",
    providerToken: "opaque-synthetic-token",
    status: "ACTIVE",
    ...overrides,
  };
}

class FakeRepository implements PushDeliveryRepository {
  readonly registrations = new Map<string, PushRegistrationForDelivery>([
    [registrationId, activeRegistration()],
  ]);
  readonly attemptsById = new Map<string, PushDeliveryAttemptRecord>();
  readonly attemptsBySource = new Map<string, PushDeliveryAttemptRecord>();
  failCreateAttemptCount = 0;
  failScheduleCount = 0;

  async findRegistration(
    id: string,
  ): Promise<PushRegistrationForDelivery | null> {
    return this.registrations.get(id) ?? null;
  }

  async findAttemptBySourceJobId(
    id: string,
  ): Promise<PushDeliveryAttemptRecord | null> {
    return this.attemptsBySource.get(id) ?? null;
  }

  async findAttemptById(id: string): Promise<PushDeliveryAttemptRecord | null> {
    return this.attemptsById.get(id) ?? null;
  }

  async createSubmittedAttempt({
    sourceJobId: jobId,
    registrationId: targetRegistrationId,
    submissionHandle,
  }: {
    readonly sourceJobId: string;
    readonly registrationId: string;
    readonly submissionHandle: string;
  }): Promise<PushDeliveryAttemptRecord> {
    if (this.failCreateAttemptCount > 0) {
      this.failCreateAttemptCount -= 1;
      throw new Error("injected persistence failure");
    }

    const attempt: PushDeliveryAttemptRecord = {
      id: deliveryAttemptId,
      registrationId: targetRegistrationId,
      submissionHandle,
      status: "SUBMITTED",
      receiptCheckScheduledAt: null,
    };
    this.attemptsById.set(attempt.id, attempt);
    this.attemptsBySource.set(jobId, attempt);
    return attempt;
  }

  async markReceiptCheckScheduled(id: string): Promise<void> {
    if (this.failScheduleCount > 0) {
      this.failScheduleCount -= 1;
      throw new Error("injected schedule-state failure");
    }
    this.replaceAttempt(id, {
      receiptCheckScheduledAt: new Date("2026-10-09T00:00:00.000Z"),
    });
  }

  async recordDisabledSkip(
    jobId: string,
    targetRegistrationId: string,
  ): Promise<void> {
    this.insertTerminalAttempt(jobId, targetRegistrationId, "SKIPPED_DISABLED");
  }

  async recordInvalidToken(
    jobId: string,
    targetRegistrationId: string,
  ): Promise<void> {
    const registration = this.registrations.get(targetRegistrationId);
    if (registration) {
      this.registrations.set(targetRegistrationId, {
        ...registration,
        status: "DISABLED",
      });
    }
    this.insertTerminalAttempt(jobId, targetRegistrationId, "INVALID_TOKEN");
  }

  async recordRejectedSend(
    jobId: string,
    targetRegistrationId: string,
  ): Promise<void> {
    this.insertTerminalAttempt(jobId, targetRegistrationId, "REJECTED");
  }

  async markReceiptAccepted(id: string): Promise<void> {
    this.replaceAttempt(id, { status: "RECEIPT_ACCEPTED" });
  }

  async markReceiptInvalidToken(
    id: string,
    targetRegistrationId: string,
  ): Promise<void> {
    const registration = this.registrations.get(targetRegistrationId);
    if (registration) {
      this.registrations.set(targetRegistrationId, {
        ...registration,
        status: "DISABLED",
      });
    }
    this.replaceAttempt(id, { status: "INVALID_TOKEN" });
  }

  async markReceiptRejected(id: string): Promise<void> {
    this.replaceAttempt(id, { status: "REJECTED" });
  }

  private insertTerminalAttempt(
    jobId: string,
    targetRegistrationId: string,
    status: PushDeliveryAttemptRecord["status"],
  ): void {
    if (this.attemptsBySource.has(jobId)) return;
    const attempt: PushDeliveryAttemptRecord = {
      id: deliveryAttemptId,
      registrationId: targetRegistrationId,
      submissionHandle: null,
      status,
      receiptCheckScheduledAt: null,
    };
    this.attemptsById.set(attempt.id, attempt);
    this.attemptsBySource.set(jobId, attempt);
  }

  private replaceAttempt(
    id: string,
    patch: Partial<PushDeliveryAttemptRecord>,
  ): void {
    const current = this.attemptsById.get(id);
    if (!current) return;
    const updated = { ...current, ...patch };
    this.attemptsById.set(id, updated);
    const sourceEntry = [...this.attemptsBySource.entries()].find(
      ([, attempt]) => attempt.id === id,
    );
    if (sourceEntry) {
      this.attemptsBySource.set(sourceEntry[0], updated);
    }
  }
}

class FakeQueue implements JobQueue {
  readonly enqueued: Array<{
    readonly payload: JsonValue;
    readonly delaySeconds: number | undefined;
  }> = [];

  async enqueue(
    payload: JsonValue,
    options?: { readonly delaySeconds?: number },
  ): Promise<QueueMessageId> {
    this.enqueued.push({
      payload,
      delaySeconds: options?.delaySeconds,
    });
    return String(this.enqueued.length) as QueueMessageId;
  }

  async receive(): Promise<[]> {
    return [];
  }

  async acknowledge(): Promise<boolean> {
    return true;
  }

  async deadLetter(): Promise<boolean> {
    return true;
  }
}

class FakePushProvider implements PushProvider {
  readonly sent: PushMessage[] = [];
  readonly checkedHandles: string[] = [];
  sendError: unknown;
  receiptError: unknown;
  receipt: PushReceiptResult = { status: "accepted" };

  async send(message: PushMessage) {
    this.sent.push(message);
    if (this.sendError !== undefined) throw this.sendError;
    return { handle: providerHandle };
  }

  async checkReceipt(handle: ReturnType<typeof parsePushSubmissionHandle>) {
    this.checkedHandles.push(handle);
    if (this.receiptError !== undefined) throw this.receiptError;
    return this.receipt;
  }
}

function setup() {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const pushProvider = new FakePushProvider();
  const sendHandler = createFoundationPushSendHandler({
    repository,
    queue,
    pushProvider,
  });
  const receiptHandler = createFoundationPushReceiptCheckHandler({
    repository,
    pushProvider,
  });

  return { repository, queue, pushProvider, sendHandler, receiptHandler };
}

async function send(
  handler: ReturnType<typeof createFoundationPushSendHandler>,
  id = sourceJobId,
  targetId = registrationId,
): Promise<void> {
  await handler.handle({ id, payload: { registrationId: targetId } });
}

async function checkReceipt(
  handler: ReturnType<typeof createFoundationPushReceiptCheckHandler>,
  id = deliveryAttemptId,
): Promise<void> {
  await handler.handle({
    id: randomUUID(),
    payload: { deliveryAttemptId: id },
  });
}

test("active registration sends fixed content, persists the handle, and schedules only the attempt ID", async () => {
  const { repository, queue, pushProvider, sendHandler } = setup();

  await send(sendHandler);

  assert.deepEqual(pushProvider.sent, [
    {
      destinationToken: "opaque-synthetic-token",
      title: "UniMate push proof",
      body: "Push notification delivery is working.",
    },
  ]);
  assert.equal(
    repository.attemptsBySource.get(sourceJobId)?.submissionHandle,
    providerHandle,
  );
  assert.equal(queue.enqueued.length, 1);
  const receiptJob = jobEnvelopeSchema.parse(queue.enqueued[0]?.payload);
  assert.equal(receiptJob.type, "foundation.push.receipt.check");
  assert.equal(receiptJob.version, 1);
  assert.deepEqual(receiptJob.payload, { deliveryAttemptId });
  assert.equal(queue.enqueued[0]?.delaySeconds, 15 * 60);
  assert.equal(
    JSON.stringify(queue.enqueued[0]?.payload ?? null).includes(
      "opaque-synthetic-token",
    ),
    false,
  );
  assert.equal(
    JSON.stringify(queue.enqueued[0]?.payload ?? null).includes(providerHandle),
    false,
  );
});

test("a recorded submission prevents duplicate sends and receipt scheduling", async () => {
  const { queue, pushProvider, sendHandler } = setup();

  await send(sendHandler);
  await send(sendHandler);

  assert.equal(pushProvider.sent.length, 1);
  assert.equal(queue.enqueued.length, 1);
});

test("send redelivery repairs receipt scheduling without resending", async () => {
  const { repository, queue, pushProvider, sendHandler } = setup();
  repository.failScheduleCount = 1;

  await assert.rejects(send(sendHandler), /injected schedule-state failure/);
  await send(sendHandler);

  assert.equal(pushProvider.sent.length, 1);
  assert.equal(queue.enqueued.length, 2);
  assert.equal(queue.enqueued[0]?.delaySeconds, 15 * 60);
  assert.equal(queue.enqueued[1]?.delaySeconds, 15 * 60);
});

test("a disabled or missing registration never reaches the push provider", async () => {
  const { repository, pushProvider, sendHandler } = setup();
  repository.registrations.set(
    registrationId,
    activeRegistration({ status: "DISABLED" }),
  );

  await send(sendHandler);
  repository.registrations.set(
    registrationId,
    activeRegistration({ status: "ACTIVE" }),
  );
  await send(sendHandler);
  await send(sendHandler, randomUUID(), randomUUID());

  assert.equal(pushProvider.sent.length, 0);
  assert.equal(
    repository.attemptsBySource.get(sourceJobId)?.status,
    "SKIPPED_DISABLED",
  );
});

test("transient send failures retry without disabling a valid registration", async () => {
  const { repository, pushProvider, sendHandler } = setup();
  const failure = new PushProviderError("transient", "temporary");
  pushProvider.sendError = failure;

  await assert.rejects(send(sendHandler), failure);

  assert.equal(repository.registrations.get(registrationId)?.status, "ACTIVE");
  assert.equal(repository.attemptsBySource.size, 0);
});

test("immediate invalid-token response disables the destination durably and is idempotent", async () => {
  const { repository, pushProvider, sendHandler } = setup();
  pushProvider.sendError = new PushProviderError(
    "invalid-token",
    "invalid destination",
  );

  await send(sendHandler);
  await send(sendHandler);

  assert.equal(pushProvider.sent.length, 1);
  assert.equal(
    repository.registrations.get(registrationId)?.status,
    "DISABLED",
  );
  assert.equal(
    repository.attemptsBySource.get(sourceJobId)?.status,
    "INVALID_TOKEN",
  );
});

test("permanent send rejection follows dead-letter semantics without disabling a healthy token", async () => {
  const { repository, pushProvider, sendHandler } = setup();
  pushProvider.sendError = new PushProviderError("rejected", "rejected");

  await assert.rejects(send(sendHandler), PermanentJobError);
  await assert.rejects(send(sendHandler), PermanentJobError);

  assert.equal(repository.registrations.get(registrationId)?.status, "ACTIVE");
  assert.equal(
    repository.attemptsBySource.get(sourceJobId)?.status,
    "REJECTED",
  );
});

test("the external acceptance-before-persistence crash window can duplicate a send", async () => {
  const { repository, pushProvider, sendHandler } = setup();
  repository.failCreateAttemptCount = 1;

  await assert.rejects(send(sendHandler), /injected persistence failure/);
  await send(sendHandler);

  assert.equal(pushProvider.sent.length, 2);
  assert.equal(repository.attemptsBySource.size, 1);
});

test("accepted receipt becomes terminal and duplicate receipt jobs are no-ops", async () => {
  const { repository, pushProvider, sendHandler, receiptHandler } = setup();
  await send(sendHandler);

  await checkReceipt(receiptHandler);
  await checkReceipt(receiptHandler);

  assert.deepEqual(pushProvider.checkedHandles, [providerHandle]);
  assert.equal(
    repository.attemptsById.get(deliveryAttemptId)?.status,
    "RECEIPT_ACCEPTED",
  );
});

test("pending receipt retries without polling inside one delivery", async () => {
  const { repository, pushProvider, sendHandler, receiptHandler } = setup();
  await send(sendHandler);
  pushProvider.receipt = { status: "pending" };

  await assert.rejects(checkReceipt(receiptHandler), /not available yet/);

  assert.equal(
    repository.attemptsById.get(deliveryAttemptId)?.status,
    "SUBMITTED",
  );
  assert.equal(pushProvider.checkedHandles.length, 1);
});

test("invalid-token receipt atomically disables its registration and is terminal", async () => {
  const { repository, pushProvider, sendHandler, receiptHandler } = setup();
  await send(sendHandler);
  pushProvider.receiptError = new PushProviderError(
    "invalid-token",
    "invalid destination",
  );

  await checkReceipt(receiptHandler);
  await checkReceipt(receiptHandler);

  assert.equal(
    repository.registrations.get(registrationId)?.status,
    "DISABLED",
  );
  assert.equal(
    repository.attemptsById.get(deliveryAttemptId)?.status,
    "INVALID_TOKEN",
  );
  assert.equal(pushProvider.checkedHandles.length, 1);
});

test("transient receipt failures retry and permanent receipt rejections dead-letter", async () => {
  const transient = setup();
  await send(transient.sendHandler);
  transient.pushProvider.receiptError = new PushProviderError(
    "transient",
    "temporary",
  );
  await assert.rejects(checkReceipt(transient.receiptHandler));
  assert.equal(
    transient.repository.attemptsById.get(deliveryAttemptId)?.status,
    "SUBMITTED",
  );

  const rejected = setup();
  await send(rejected.sendHandler);
  rejected.pushProvider.receiptError = new PushProviderError(
    "rejected",
    "permanent",
  );
  await assert.rejects(
    checkReceipt(rejected.receiptHandler),
    PermanentJobError,
  );
  await assert.rejects(
    checkReceipt(rejected.receiptHandler),
    PermanentJobError,
  );
  assert.equal(
    rejected.repository.attemptsById.get(deliveryAttemptId)?.status,
    "REJECTED",
  );
  assert.equal(
    rejected.repository.registrations.get(registrationId)?.status,
    "ACTIVE",
  );
});

test("receipt scheduling delay is injectable and rejects invalid values", async () => {
  const { repository, queue, pushProvider } = setup();
  const handler = createFoundationPushSendHandler({
    repository,
    queue,
    pushProvider,
    receiptCheckDelaySeconds: 0,
  });

  await send(handler);

  assert.equal(queue.enqueued[0]?.delaySeconds, 0);
  assert.equal(FOUNDATION_PUSH_RECEIPT_CHECK_DELAY_SECONDS, 900);
  assert.throws(
    () =>
      createFoundationPushSendHandler({
        repository,
        queue,
        pushProvider,
        receiptCheckDelaySeconds: -1,
      }),
    TypeError,
  );
});
