import { Module, type DynamicModule } from "@nestjs/common";
import { ORPCModule } from "@orpc/nest";
import type { ApiConfig } from "./config/environment.js";
import {
  AuthModule,
  type AuthModuleOverrides,
} from "./modules/auth/auth.module.js";
import { SystemModule } from "./modules/system/system.module.js";

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
        SystemModule,
        AuthModule.register(config, authOverrides),
      ],
    };
  }
}
