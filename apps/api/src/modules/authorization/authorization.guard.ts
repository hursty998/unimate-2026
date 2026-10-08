import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { isCapabilityForScope } from "@unimate/authorization";
import type { AuthenticatedRequest } from "../auth/authenticated-principal.js";
import { AuthorizationService } from "./authorization.service.js";

export const REQUIRED_CAPABILITY_METADATA = "unimate:required-capability";

@Injectable()
export class AuthorizationGuard implements CanActivate {
  private readonly logger = new Logger(AuthorizationGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(AuthorizationService)
    private readonly authorization: Pick<AuthorizationService, "can">,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const capability = this.reflector.getAllAndOverride<unknown>(
      REQUIRED_CAPABILITY_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (capability === undefined) {
      return true;
    }

    if (!isCapabilityForScope(capability, "PLATFORM")) {
      throw new InternalServerErrorException(
        "The required capability is not valid for this route.",
      );
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.authenticatedPrincipal;

    if (!principal) {
      throw new UnauthorizedException();
    }

    let allowed: boolean;
    try {
      allowed = await this.authorization.can(principal, capability, {
        kind: "PLATFORM",
      });
    } catch (error) {
      this.logger.error(
        "Capability verification failed.",
        error instanceof Error ? error.name : "UnknownError",
      );
      throw new InternalServerErrorException(
        "Unable to verify the required capability.",
      );
    }

    if (!allowed) {
      throw new ForbiddenException();
    }

    return true;
  }
}
