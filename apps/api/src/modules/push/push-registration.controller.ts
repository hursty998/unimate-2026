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
export class PushRegistrationController {
  constructor(private readonly push: PushRegistrationService) {}

  @Authenticated()
  @Implement(contract.pushRegistration.register)
  register(@CurrentAuthenticatedPrincipal() principal: AuthenticatedPrincipal) {
    return implement(contract.pushRegistration.register).handler(({ input }) =>
      this.push.register(principal, input),
    );
  }

  @Authenticated()
  @Implement(contract.pushRegistration.unregister)
  unregister(
    @CurrentAuthenticatedPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return implement(contract.pushRegistration.unregister).handler(
      ({ input }) => this.push.unregister(principal, input.id),
    );
  }
}
