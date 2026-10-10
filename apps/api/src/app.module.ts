import { Module, type DynamicModule } from "@nestjs/common";
import { ORPCModule } from "@orpc/nest";
import type { NodeObservabilityServices } from "@unimate/observability/node";
import type { ApiConfig } from "./config/environment.js";
import {
  AuthModule,
  type AuthModuleOverrides,
} from "./modules/auth/auth.module.js";
import { DatabaseModule } from "./infrastructure/database/database.module.js";
import { AuthorizationModule } from "./modules/authorization/authorization.module.js";
import { SystemModule } from "./modules/system/system.module.js";
import { StorageProofModule } from "./modules/storage-proof/storage-proof.module.js";
import { ObjectStorageModule } from "./providers/object-storage.module.js";
import { PushModule } from "./modules/push/push.module.js";
import { ObservabilityModule } from "./infrastructure/observability/observability.module.js";
import { FoundationObservabilityProofModule } from "./modules/observability-proof/foundation-observability-proof.module.js";

@Module({})
export class AppModule {
  static register(
    config: ApiConfig,
    observability: NodeObservabilityServices,
    authOverrides: AuthModuleOverrides = {},
  ): DynamicModule {
    const storageProofModules =
      config.nodeEnv === "production"
        ? []
        : [ObjectStorageModule.register(config), StorageProofModule];
    const observabilityProofModules =
      config.nodeEnv === "production"
        ? []
        : [FoundationObservabilityProofModule];

    return {
      module: AppModule,
      imports: [
        ORPCModule.forRoot({}),
        ObservabilityModule.register(observability),
        DatabaseModule.forRoot({
          connectionString: config.databaseUrl,
          slowQueryThresholdMilliseconds:
            config.observability.slowQueryThresholdMilliseconds,
          onSlowQuery(timing) {
            observability.logger.warn("database.query.slow", {
              ...(timing.model ? { model: timing.model } : {}),
              operation: timing.operation,
              duration_ms: timing.durationMilliseconds,
              threshold_ms: config.observability.slowQueryThresholdMilliseconds,
            });
          },
        }),
        SystemModule,
        AuthModule.register(config, authOverrides),
        AuthorizationModule,
        PushModule.register({
          foundationProofEnabled: config.nodeEnv !== "production",
        }),
        ...storageProofModules,
        ...observabilityProofModules,
      ],
    };
  }
}
