import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AccessTokenVerifier } from "@unimate/auth";
import {
  API_ACCESS_POSTURE_METADATA,
  type ApiAccessPosture,
} from "./access-posture.decorator.js";
import type { AuthenticatedRequest } from "./authenticated-principal.js";

export const ACCESS_TOKEN_VERIFIER = Symbol("ACCESS_TOKEN_VERIFIER");

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_VERIFIER)
    private readonly tokenVerifier: AccessTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const accessPosture = this.reflector.getAllAndOverride<ApiAccessPosture>(
      API_ACCESS_POSTURE_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (accessPosture === "PUBLIC") {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const bearerToken = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];

    if (!bearerToken) {
      throw new UnauthorizedException();
    }

    try {
      request.authenticatedPrincipal =
        await this.tokenVerifier.verify(bearerToken);
    } catch {
      throw new UnauthorizedException();
    }

    return true;
  }
}
