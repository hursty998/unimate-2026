import { Injectable } from "@nestjs/common";
import {
  FOUNDATION_PUSH_SEND_JOB_TYPE,
  foundationPushSendPayloadSchema,
} from "@unimate/jobs";
import { DatabaseClientService } from "../../infrastructure/database/database.module.js";
import { OutboxLineageService } from "../../infrastructure/observability/observability.module.js";
import type { AuthenticatedPrincipal } from "../auth/authenticated-principal.js";

export interface PushRegistrationRepository {
  resolveUserId(principal: AuthenticatedPrincipal): Promise<string | null>;
  register(input: {
    readonly userId: string;
    readonly providerToken: string;
    readonly platform: "ios" | "android";
  }): Promise<{ readonly id: string }>;
  disableOwned(id: string, userId: string): Promise<boolean>;
  createFoundationProof(
    registrationId: string,
    userId: string,
  ): Promise<string | null>;
}

export const PUSH_REGISTRATION_REPOSITORY = Symbol(
  "PUSH_REGISTRATION_REPOSITORY",
);

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "P2002";
}

@Injectable()
export class PrismaPushRegistrationRepository implements PushRegistrationRepository {
  constructor(
    private readonly database: DatabaseClientService,
    private readonly outboxLineage: OutboxLineageService,
  ) {}

  async resolveUserId(
    principal: AuthenticatedPrincipal,
  ): Promise<string | null> {
    const identity = await this.database.client.authIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: principal.provider,
          providerSubject: principal.providerSubject,
        },
      },
      select: { userId: true },
    });

    return identity?.userId ?? null;
  }

  async register(input: {
    readonly userId: string;
    readonly providerToken: string;
    readonly platform: "ios" | "android";
  }): Promise<{ readonly id: string }> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.database.client.$transaction(async (transaction) => {
          const activeRegistration =
            await transaction.pushRegistration.findFirst({
              where: {
                provider: "EXPO",
                providerToken: input.providerToken,
                status: "ACTIVE",
              },
              select: { id: true, userId: true },
            });

          if (activeRegistration?.userId === input.userId) {
            return transaction.pushRegistration.update({
              where: { id: activeRegistration.id },
              data: {
                platform: input.platform === "ios" ? "IOS" : "ANDROID",
                status: "ACTIVE",
              },
              select: { id: true },
            });
          }

          if (activeRegistration !== null) {
            await transaction.pushRegistration.update({
              where: { id: activeRegistration.id },
              data: { status: "DISABLED" },
            });
          }

          return transaction.pushRegistration.create({
            data: {
              userId: input.userId,
              provider: "EXPO",
              platform: input.platform === "ios" ? "IOS" : "ANDROID",
              providerToken: input.providerToken,
              status: "ACTIVE",
            },
            select: { id: true },
          });
        });
      } catch (error) {
        if (!isUniqueConstraintViolation(error) || attempt === 2) {
          throw error;
        }
      }
    }

    throw new Error("Push registration could not be persisted.");
  }

  async disableOwned(id: string, userId: string): Promise<boolean> {
    const result = await this.database.client.pushRegistration.updateMany({
      where: { id, userId },
      data: { status: "DISABLED" },
    });

    return result.count > 0;
  }

  async createFoundationProof(
    registrationId: string,
    userId: string,
  ): Promise<string | null> {
    return this.database.client.$transaction(async (transaction) => {
      const registration = await transaction.pushRegistration.findFirst({
        where: { id: registrationId, userId, status: "ACTIVE" },
        select: { id: true },
      });

      if (registration === null) {
        return null;
      }

      const payload = foundationPushSendPayloadSchema.parse({
        registrationId: registration.id,
      });
      const outboxMessage = await transaction.outboxMessage.create({
        data: {
          eventType: FOUNDATION_PUSH_SEND_JOB_TYPE,
          payloadVersion: 1,
          payload,
          ...this.outboxLineage.capture(),
        },
        select: { id: true },
      });

      return outboxMessage.id;
    });
  }
}
