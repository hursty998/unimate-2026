import { Capabilities } from "@unimate/authorization";
import type { AuthorizationService } from "../modules/authorization/authorization.service.js";
import type { AuthenticatedPrincipal } from "../modules/auth/authenticated-principal.js";

interface OwnedDraftResource {
  ownerId: string;
  lifecycle: "DRAFT" | "ARCHIVED";
}

export class TestOnlyOwnedDraftResourceService {
  constructor(
    private readonly authorization: Pick<AuthorizationService, "can">,
  ) {}

  async updateDraft(
    principal: AuthenticatedPrincipal,
    actorUserId: string,
    resource: OwnedDraftResource,
    update: () => void,
  ): Promise<void> {
    const hasCoarseCapability = await this.authorization.can(
      principal,
      Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
      { kind: "PLATFORM" },
    );
    if (!hasCoarseCapability) {
      throw new Error("Coarse capability denied");
    }

    const resourcePolicyAllowsUpdate =
      resource.ownerId === actorUserId && resource.lifecycle === "DRAFT";
    if (!resourcePolicyAllowsUpdate) {
      throw new Error("Feature-local resource policy denied the update");
    }

    update();
  }
}
