import { Injectable } from "@nestjs/common";
import type { AuthMeResponse } from "@unimate/contracts";
import { DatabaseClientService } from "../../infrastructure/database/database.module.js";
import type { AuthenticatedPrincipal } from "./authenticated-principal.js";

type IdentityWithUser = {
  user: {
    id: string;
    universityAffiliations: Array<{ universityId: string }>;
  };
};

const identityWithUserSelection = {
  user: {
    select: {
      id: true,
      universityAffiliations: {
        select: { universityId: true },
      },
    },
  },
} as const;

function toAuthMeResponse(identity: IdentityWithUser): AuthMeResponse {
  return {
    user: { id: identity.user.id },
    universityAffiliations: identity.user.universityAffiliations.map(
      ({ universityId }) => ({ universityId }),
    ),
  };
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "P2002";
}

@Injectable()
export class AuthMeService {
  constructor(private readonly database: DatabaseClientService) {}

  async getMe(principal: AuthenticatedPrincipal): Promise<AuthMeResponse> {
    const where = {
      provider_providerSubject: {
        provider: principal.provider,
        providerSubject: principal.providerSubject,
      },
    };
    const existingIdentity = await this.database.client.authIdentity.findUnique(
      {
        where,
        select: identityWithUserSelection,
      },
    );

    if (existingIdentity) {
      return toAuthMeResponse(existingIdentity);
    }

    try {
      const identity = await this.database.client.$transaction(async (tx) => {
        const concurrentlyCreatedIdentity = await tx.authIdentity.findUnique({
          where,
          select: identityWithUserSelection,
        });

        if (concurrentlyCreatedIdentity) {
          return concurrentlyCreatedIdentity;
        }

        const user = await tx.user.create({ data: {} });

        return tx.authIdentity.create({
          data: {
            provider: principal.provider,
            providerSubject: principal.providerSubject,
            userId: user.id,
          },
          select: identityWithUserSelection,
        });
      });

      return toAuthMeResponse(identity);
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }

      const winningIdentity =
        await this.database.client.authIdentity.findUnique({
          where,
          select: identityWithUserSelection,
        });

      if (!winningIdentity) {
        throw error;
      }

      return toAuthMeResponse(winningIdentity);
    }
  }
}
