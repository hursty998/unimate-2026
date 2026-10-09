import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@unimate/contracts";
import { Authenticated } from "../auth/access-posture.decorator.js";
import {
  CurrentAuthenticatedPrincipal,
  type AuthenticatedPrincipal,
} from "../auth/authenticated-principal.js";
import { PushRegistrationService } from "./push-registration.service.js";

@Controller()
export class FoundationPushProofController {
  constructor(private readonly push: PushRegistrationService) {}

  @Authenticated()
  @Implement(contract.foundationPush.proof)
  queueProof(
    @CurrentAuthenticatedPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return implement(contract.foundationPush.proof).handler(({ input }) =>
      this.push.queueFoundationProof(principal, input.registrationId),
    );
  }
}
