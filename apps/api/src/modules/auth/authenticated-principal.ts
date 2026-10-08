import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { VerifiedIdentity } from "@unimate/auth";

export type AuthenticatedPrincipal = VerifiedIdentity;

export type AuthenticatedRequest = FastifyRequest & {
  authenticatedPrincipal?: AuthenticatedPrincipal;
};

export const CurrentAuthenticatedPrincipal = createParamDecorator<
  undefined,
  AuthenticatedPrincipal
>((_data: undefined, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  const principal = request.authenticatedPrincipal;

  if (!principal) {
    throw new UnauthorizedException();
  }

  return principal;
});
