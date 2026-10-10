import { Inject, Injectable } from "@nestjs/common";
import type { SystemHealthResponse } from "@unimate/contracts";
import { safeErrorType, type StructuredLogger } from "@unimate/observability";
import { DatabaseClientService } from "../../infrastructure/database/database.module.js";
import { API_STRUCTURED_LOGGER } from "../../infrastructure/observability/observability.module.js";

export interface SystemDatabaseProbe {
  check(): Promise<void>;
}

export const SYSTEM_DATABASE_PROBE = Symbol("SYSTEM_DATABASE_PROBE");

@Injectable()
export class SystemService {
  constructor(
    @Inject(SYSTEM_DATABASE_PROBE)
    private readonly databaseProbe: SystemDatabaseProbe,
    @Inject(API_STRUCTURED_LOGGER)
    private readonly logger: StructuredLogger,
  ) {}

  health(): SystemHealthResponse {
    return {
      status: "ok",
      service: "unimate-api",
      apiVersion: "v1",
    };
  }

  async readiness(): Promise<boolean> {
    try {
      await this.databaseProbe.check();
      return true;
    } catch (error) {
      this.logger.warn("system.readiness.failed", {
        error_type: safeErrorType(error),
      });
      return false;
    }
  }
}

@Injectable()
export class PrismaSystemDatabaseProbe implements SystemDatabaseProbe {
  constructor(private readonly database: DatabaseClientService) {}

  async check(): Promise<void> {
    await this.database.client.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT 1`;
      },
      { maxWait: 1_000, timeout: 1_000 },
    );
  }
}
