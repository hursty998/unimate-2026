import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@unimate/contracts";
import { Authenticated } from "./access-posture.decorator.js";
import {
  CurrentAuthenticatedPrincipal,
  type AuthenticatedPrincipal,
} from "./authenticated-principal.js";
import { AuthMeService } from "./auth-me.service.js";

@Controller()
export class AuthController {
  constructor(private readonly authMeService: AuthMeService) {}

  @Implement(contract.auth.me)
  @Authenticated()
  me(@CurrentAuthenticatedPrincipal() principal: AuthenticatedPrincipal) {
    return implement(contract.auth.me).handler(() =>
      this.authMeService.getMe(principal),
    );
  }
}
