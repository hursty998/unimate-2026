import { applyDecorators, SetMetadata, UseGuards } from "@nestjs/common";
import {
  API_ACCESS_POSTURE_METADATA,
  type ApiAccessPosture,
} from "../auth/access-posture.decorator.js";
import type { PlatformCapability } from "@unimate/authorization";
import {
  AuthorizationGuard,
  REQUIRED_CAPABILITY_METADATA,
} from "./authorization.guard.js";

export function RequireCapability(
  capability: PlatformCapability,
): ClassDecorator & MethodDecorator {
  return applyDecorators(
    SetMetadata(REQUIRED_CAPABILITY_METADATA, capability),
    SetMetadata(
      API_ACCESS_POSTURE_METADATA,
      "AUTHORISED" satisfies ApiAccessPosture,
    ),
    UseGuards(AuthorizationGuard),
  );
}
