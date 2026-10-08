import { Injectable } from "@nestjs/common";
import {
  capabilitySupportsScope,
  isAuthorizationScope,
  isCapability,
  type AuthorizationScope,
  type Capability,
} from "@unimate/authorization";
import { DatabaseClientService } from "../../infrastructure/database/database.module.js";
import type { AuthenticatedPrincipal } from "../auth/authenticated-principal.js";

@Injectable()
export class AuthorizationService {
  constructor(private readonly database: DatabaseClientService) {}

  async can(
    principal: AuthenticatedPrincipal,
    capability: Capability,
    scope: AuthorizationScope,
  ): Promise<boolean> {
    if (
      !isCapability(capability) ||
      !isAuthorizationScope(scope) ||
      !capabilitySupportsScope(capability, scope.kind)
    ) {
      return false;
    }

    const assignmentScope = {
      scopeKind: scope.kind,
      universityId: scope.kind === "UNIVERSITY" ? scope.universityId : null,
    };
    const identity = await this.database.client.authIdentity.findFirst({
      where: {
        provider: principal.provider,
        providerSubject: principal.providerSubject,
        user: {
          is: {
            OR: [
              {
                capabilityAssignments: {
                  some: {
                    ...assignmentScope,
                    capability,
                  },
                },
              },
              {
                roleAssignments: {
                  some: {
                    ...assignmentScope,
                    role: {
                      is: {
                        scopeKind: scope.kind,
                        capabilities: {
                          some: { capability },
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      },
      select: { id: true },
    });

    return identity !== null;
  }
}
