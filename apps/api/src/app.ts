import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import { parseApiConfig, type ApiConfig } from "./config/environment.js";

const localDevelopmentOrigins = [
  /^https?:\/\/localhost(?::\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^https?:\/\/\[::1\](?::\d+)?$/,
];

export async function createApiApplication(
  config: ApiConfig = parseApiConfig(),
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bodyParser: false },
  );

  app.enableCors({
    origin:
      config.nodeEnv === "production"
        ? config.corsOrigins
        : [...localDevelopmentOrigins, ...config.corsOrigins],
    methods: ["GET", "OPTIONS"],
  });

  await app.init();

  return app;
}
