import { Module } from "@nestjs/common";
import { AuthorizationGuard } from "./authorization.guard.js";
import { AuthorizationService } from "./authorization.service.js";

@Module({
  providers: [AuthorizationService, AuthorizationGuard],
  exports: [AuthorizationService, AuthorizationGuard],
})
export class AuthorizationModule {}
