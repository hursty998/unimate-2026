import { APP_GUARD } from "@nestjs/core";
import { Module, type DynamicModule } from "@nestjs/common";
import {
  createSupabaseAccessTokenVerifier,
  type AccessTokenVerifier,
} from "@unimate/auth";
import type { ApiConfig } from "../../config/environment.js";
import { DatabaseModule } from "../../infrastructure/database/database.module.js";
import {
  AuthenticationGuard,
  ACCESS_TOKEN_VERIFIER,
} from "./authentication.guard.js";
import { AuthController } from "./auth.controller.js";
import { AuthMeService } from "./auth-me.service.js";

export interface AuthModuleOverrides {
  tokenVerifier?: AccessTokenVerifier;
  authMeService?: Pick<AuthMeService, "getMe">;
}

@Module({})
export class AuthModule {
  static register(
    config: ApiConfig,
    overrides: AuthModuleOverrides = {},
  ): DynamicModule {
    const providers = [
      {
        provide: ACCESS_TOKEN_VERIFIER,
        useValue:
          overrides.tokenVerifier ??
          createSupabaseAccessTokenVerifier({
            supabaseUrl: config.supabaseUrl,
            audience: config.supabaseJwtAudience,
          }),
      },
      {
        provide: AuthMeService,
        ...(overrides.authMeService
          ? { useValue: overrides.authMeService }
          : { useClass: AuthMeService }),
      },
      {
        provide: APP_GUARD,
        useClass: AuthenticationGuard,
      },
    ];

    return {
      module: AuthModule,
      imports: overrides.authMeService
        ? []
        : [DatabaseModule.forRoot(config.databaseUrl)],
      controllers: [AuthController],
      providers,
    };
  }
}
