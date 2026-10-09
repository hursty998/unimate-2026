import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type { AuthenticatedPrincipal } from "../auth/authenticated-principal.js";
import {
  PUSH_REGISTRATION_REPOSITORY,
  type PushRegistrationRepository,
} from "./push-registration.repository.js";

@Injectable()
export class PushRegistrationService {
  constructor(
    @Inject(PUSH_REGISTRATION_REPOSITORY)
    private readonly repository: PushRegistrationRepository,
  ) {}

  async register(
    principal: AuthenticatedPrincipal,
    input: { readonly token: string; readonly platform: "ios" | "android" },
  ): Promise<{ readonly id: string; readonly status: "ACTIVE" }> {
    const userId = await this.requireUserId(principal);
    const registration = await this.repository.register({
      userId,
      providerToken: input.token,
      platform: input.platform,
    });

    return { id: registration.id, status: "ACTIVE" };
  }

  async unregister(
    principal: AuthenticatedPrincipal,
    id: string,
  ): Promise<{ readonly disabled: true }> {
    const userId = await this.requireUserId(principal);
    const disabled = await this.repository.disableOwned(id, userId);

    if (!disabled) {
      throw new ORPCError("NOT_FOUND", {
        message: "Push registration not found.",
      });
    }

    return { disabled: true };
  }

  async queueFoundationProof(
    principal: AuthenticatedPrincipal,
    registrationId: string,
  ): Promise<{ readonly proofId: string }> {
    const userId = await this.requireUserId(principal);
    const proofId = await this.repository.createFoundationProof(
      registrationId,
      userId,
    );

    if (proofId === null) {
      throw new ORPCError("NOT_FOUND", {
        message: "Push registration not found.",
      });
    }

    return { proofId };
  }

  private async requireUserId(
    principal: AuthenticatedPrincipal,
  ): Promise<string> {
    const userId = await this.repository.resolveUserId(principal);

    if (userId === null) {
      throw new ORPCError("FORBIDDEN");
    }

    return userId;
  }
}
