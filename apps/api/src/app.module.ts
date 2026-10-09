import { Module, type DynamicModule } from "@nestjs/common";
import { ORPCModule } from "@orpc/nest";
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

@Module({})
export class AppModule {
  static register(
    config: ApiConfig,
    authOverrides: AuthModuleOverrides = {},
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ORPCModule.forRoot({}),
        DatabaseModule.forRoot(config.databaseUrl),
        SystemModule,
        AuthModule.register(config, authOverrides),
        AuthorizationModule,
        ObjectStorageModule.register(config),
        StorageProofModule,
      ],
    };
  }
}
