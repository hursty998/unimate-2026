import { createDatabaseClient } from "@unimate/database";

export type PushRegistrationForDelivery = {
  readonly id: string;
  readonly provider: "EXPO";
  readonly platform: "IOS" | "ANDROID";
  readonly providerToken: string;
  readonly status: "ACTIVE" | "DISABLED";
};

export type PushDeliveryAttemptRecord = {
  readonly id: string;
  readonly registrationId: string;
  readonly submissionHandle: string | null;
  readonly status:
    | "SUBMITTED"
    | "RECEIPT_ACCEPTED"
    | "INVALID_TOKEN"
    | "REJECTED"
    | "SKIPPED_DISABLED";
  readonly receiptCheckScheduledAt: Date | null;
};

export interface PushDeliveryRepository {
  findRegistration(id: string): Promise<PushRegistrationForDelivery | null>;
  findAttemptBySourceJobId(
    sourceJobId: string,
  ): Promise<PushDeliveryAttemptRecord | null>;
  findAttemptById(id: string): Promise<PushDeliveryAttemptRecord | null>;
  createSubmittedAttempt(input: {
    readonly sourceJobId: string;
    readonly registrationId: string;
    readonly submissionHandle: string;
  }): Promise<PushDeliveryAttemptRecord>;
  markReceiptCheckScheduled(id: string, scheduledAt: Date): Promise<void>;
  recordDisabledSkip(
    sourceJobId: string,
    registrationId: string,
  ): Promise<void>;
  recordInvalidToken(
    sourceJobId: string,
    registrationId: string,
  ): Promise<void>;
  recordRejectedSend(
    sourceJobId: string,
    registrationId: string,
  ): Promise<void>;
  markReceiptAccepted(id: string, checkedAt: Date): Promise<void>;
  markReceiptInvalidToken(
    id: string,
    registrationId: string,
    checkedAt: Date,
  ): Promise<void>;
  markReceiptRejected(id: string, checkedAt: Date): Promise<void>;
}

type WorkerDatabase = ReturnType<typeof createDatabaseClient>;

export class PrismaPushDeliveryRepository implements PushDeliveryRepository {
  constructor(private readonly database: WorkerDatabase) {}

  findRegistration(id: string): Promise<PushRegistrationForDelivery | null> {
    return this.database.pushRegistration.findUnique({
      where: { id },
      select: {
        id: true,
        provider: true,
        platform: true,
        providerToken: true,
        status: true,
      },
    });
  }

  findAttemptBySourceJobId(
    sourceJobId: string,
  ): Promise<PushDeliveryAttemptRecord | null> {
    return this.database.pushDeliveryAttempt.findUnique({
      where: { sourceJobId },
      select: {
        id: true,
        registrationId: true,
        submissionHandle: true,
        status: true,
        receiptCheckScheduledAt: true,
      },
    });
  }

  findAttemptById(id: string): Promise<PushDeliveryAttemptRecord | null> {
    return this.database.pushDeliveryAttempt.findUnique({
      where: { id },
      select: {
        id: true,
        registrationId: true,
        submissionHandle: true,
        status: true,
        receiptCheckScheduledAt: true,
      },
    });
  }

  createSubmittedAttempt(input: {
    readonly sourceJobId: string;
    readonly registrationId: string;
    readonly submissionHandle: string;
  }): Promise<PushDeliveryAttemptRecord> {
    return this.database.pushDeliveryAttempt.create({
      data: {
        sourceJobId: input.sourceJobId,
        registrationId: input.registrationId,
        submissionHandle: input.submissionHandle,
        status: "SUBMITTED",
      },
      select: {
        id: true,
        registrationId: true,
        submissionHandle: true,
        status: true,
        receiptCheckScheduledAt: true,
      },
    });
  }

  async markReceiptCheckScheduled(
    id: string,
    scheduledAt: Date,
  ): Promise<void> {
    await this.database.pushDeliveryAttempt.updateMany({
      where: {
        id,
        status: "SUBMITTED",
        receiptCheckScheduledAt: null,
      },
      data: { receiptCheckScheduledAt: scheduledAt },
    });
  }

  async recordDisabledSkip(
    sourceJobId: string,
    registrationId: string,
  ): Promise<void> {
    await this.database.pushDeliveryAttempt.createMany({
      data: [
        {
          sourceJobId,
          registrationId,
          status: "SKIPPED_DISABLED",
        },
      ],
      skipDuplicates: true,
    });
  }

  async recordInvalidToken(
    sourceJobId: string,
    registrationId: string,
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await transaction.pushDeliveryAttempt.createMany({
        data: [
          {
            sourceJobId,
            registrationId,
            status: "INVALID_TOKEN",
          },
        ],
        skipDuplicates: true,
      });
      await transaction.pushRegistration.updateMany({
        where: { id: registrationId, status: "ACTIVE" },
        data: { status: "DISABLED" },
      });
    });
  }

  async recordRejectedSend(
    sourceJobId: string,
    registrationId: string,
  ): Promise<void> {
    await this.database.pushDeliveryAttempt.createMany({
      data: [
        {
          sourceJobId,
          registrationId,
          status: "REJECTED",
        },
      ],
      skipDuplicates: true,
    });
  }

  async markReceiptAccepted(id: string, checkedAt: Date): Promise<void> {
    await this.database.pushDeliveryAttempt.updateMany({
      where: { id, status: "SUBMITTED" },
      data: { status: "RECEIPT_ACCEPTED", receiptCheckedAt: checkedAt },
    });
  }

  async markReceiptInvalidToken(
    id: string,
    registrationId: string,
    checkedAt: Date,
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const result = await transaction.pushDeliveryAttempt.updateMany({
        where: { id, status: "SUBMITTED" },
        data: { status: "INVALID_TOKEN", receiptCheckedAt: checkedAt },
      });

      if (result.count > 0) {
        await transaction.pushRegistration.updateMany({
          where: { id: registrationId, status: "ACTIVE" },
          data: { status: "DISABLED" },
        });
      }
    });
  }

  async markReceiptRejected(id: string, checkedAt: Date): Promise<void> {
    await this.database.pushDeliveryAttempt.updateMany({
      where: { id, status: "SUBMITTED" },
      data: { status: "REJECTED", receiptCheckedAt: checkedAt },
    });
  }
}
