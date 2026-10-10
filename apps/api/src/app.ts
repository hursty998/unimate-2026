import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import {
  createNodeObservabilityServices,
  type NodeObservabilityRuntime,
  type NodeObservabilityServices,
} from "@unimate/observability/node";
import { AppModule } from "./app.module.js";
import type { ApiConfig } from "./config/environment.js";
import type { AuthModuleOverrides } from "./modules/auth/auth.module.js";
import { registerHttpObservability } from "./infrastructure/observability/http-observability.js";

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
  observability?: NodeObservabilityServices | NodeObservabilityRuntime,
): Promise<NestFastifyApplication> {
  const activeObservability =
    observability ??
    createNodeObservabilityServices({
      serviceName: "unimate-api",
      config: config.observability,
    });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(config, activeObservability, authOverrides),
    new FastifyAdapter(),
    { bodyParser: false, logger: false },
  );
  const fastify = app.getHttpAdapter().getInstance();

  app.enableCors({
    origin:
      config.nodeEnv === "production"
        ? config.corsOrigins
        : [...localDevelopmentOrigins, ...config.corsOrigins],
    methods: corsMethods,
    exposedHeaders: ["x-request-id", "x-correlation-id"],
  });

  registerHttpObservability(fastify, activeObservability);
  if (hasRuntimeLifecycle(activeObservability)) {
    fastify.addHook("onClose", async () => {
      activeObservability.logger.info("process.stopping");
      await activeObservability.shutdown();
    });
  }

  await app.init();

  return app;
}

function hasRuntimeLifecycle(
  observability: NodeObservabilityServices | NodeObservabilityRuntime,
): observability is NodeObservabilityRuntime {
  return (
    "shutdown" in observability && typeof observability.shutdown === "function"
  );
}
