import "reflect-metadata";
import { safeErrorType } from "@unimate/observability";
import {
  createNodeObservabilityServices,
  startNodeObservabilityRuntime,
} from "@unimate/observability/node";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApiApplication } from "./app.js";
import { parseApiConfig } from "./config/environment.js";

async function main(): Promise<void> {
  const config = parseApiConfig();
  const observability = startNodeObservabilityRuntime({
    serviceName: "unimate-api",
    config: config.observability,
  });
  let app: NestFastifyApplication | undefined;

  try {
    app = await createApiApplication(config, {}, observability);
    app.enableShutdownHooks();
    await app.listen(config.port, config.host);
    observability.logger.info("process.started");
  } catch (error) {
    observability.logger.error("process.failed", {
      error_type: safeErrorType(error),
    });
    try {
      await observability.errorReporter.captureException(error, {
        operation: "api.startup",
      });
    } catch (reportingError) {
      observability.logger.error("error.reporting.failed", {
        error_type: safeErrorType(reportingError),
        operation: "api.startup",
      });
    }
    try {
      if (app) {
        await app.close();
      } else {
        await observability.shutdown();
      }
    } catch (shutdownError) {
      observability.logger.error("process.shutdown.failed", {
        error_type: safeErrorType(shutdownError),
      });
    }
    process.exitCode = 1;
  }
}

void main().catch(async (error: unknown) => {
  const environment =
    process.env["NODE_ENV"] === "test" ||
    process.env["NODE_ENV"] === "production"
      ? process.env["NODE_ENV"]
      : "development";
  const fallback = createNodeObservabilityServices({
    serviceName: "unimate-api",
    config: {
      environment,
      logLevel: "error",
      traceExporter: "none",
      slowQueryThresholdMilliseconds: 250,
    },
  });
  fallback.logger.error("process.failed", {
    error_type: safeErrorType(error),
  });
  try {
    await fallback.errorReporter.captureException(error, {
      operation: "api.startup",
    });
  } catch (reportingError) {
    fallback.logger.error("error.reporting.failed", {
      error_type: safeErrorType(reportingError),
      operation: "api.startup",
    });
  }
  try {
    await fallback.logger.flush?.();
  } catch {
    process.exitCode = 1;
  }

  process.exitCode = 1;
});
