import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import type { ApiConfig } from "./config/environment.js";
import type { AuthModuleOverrides } from "./modules/auth/auth.module.js";

const localDevelopmentOrigins = [
  /^https?:\/\/localhost(?::\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^https?:\/\/\[::1\](?::\d+)?$/,
];

const corsMethods = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
];

export async function createApiApplication(
  config: ApiConfig,
  authOverrides: AuthModuleOverrides = {},
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(config, authOverrides),
    new FastifyAdapter(),
    { bodyParser: false },
  );

  app.enableCors({
    origin:
      config.nodeEnv === "production"
        ? config.corsOrigins
        : [...localDevelopmentOrigins, ...config.corsOrigins],
    methods: corsMethods,
  });

  await app.init();

  return app;
}
