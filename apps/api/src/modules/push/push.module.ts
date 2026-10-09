import { Module, type DynamicModule } from "@nestjs/common";
import { FoundationPushProofController } from "./foundation-push-proof.controller.js";
import { PushRegistrationController } from "./push-registration.controller.js";
import {
  PrismaPushRegistrationRepository,
  PUSH_REGISTRATION_REPOSITORY,
} from "./push-registration.repository.js";
import { PushRegistrationService } from "./push-registration.service.js";

@Module({})
export class PushModule {
  static register({
    foundationProofEnabled,
  }: {
    readonly foundationProofEnabled: boolean;
  }): DynamicModule {
    return {
      module: PushModule,
      controllers: [
        PushRegistrationController,
        ...(foundationProofEnabled ? [FoundationPushProofController] : []),
      ],
      providers: [
        PrismaPushRegistrationRepository,
        {
          provide: PUSH_REGISTRATION_REPOSITORY,
          useExisting: PrismaPushRegistrationRepository,
        },
        PushRegistrationService,
      ],
    };
  }
}
