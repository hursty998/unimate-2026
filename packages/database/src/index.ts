import { PrismaPg } from "@prisma/adapter-pg";
import { performance } from "node:perf_hooks";
import { PrismaClient } from "./generated/prisma/client.js";

export interface DatabaseClientOptions {
  readonly connectionString: string;
  readonly slowQueryThresholdMilliseconds?: number;
  readonly onSlowQuery?: (timing: DatabaseQueryTiming) => void;
}

export interface DatabaseQueryTiming {
  readonly model?: string;
  readonly operation: string;
  readonly durationMilliseconds: number;
}

export function createDatabaseClient({
  connectionString,
  slowQueryThresholdMilliseconds = 250,
  onSlowQuery,
}: DatabaseClientOptions) {
  if (connectionString.trim().length === 0) {
    throw new Error("A PostgreSQL connection string is required.");
  }

  if (
    !Number.isSafeInteger(slowQueryThresholdMilliseconds) ||
    slowQueryThresholdMilliseconds < 0
  ) {
    throw new RangeError(
      "The slow-query threshold must be a non-negative integer.",
    );
  }

  const adapter = new PrismaPg({ connectionString }, { schema: "app" });
  const client = new PrismaClient({ adapter });

  return client.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        if (!onSlowQuery) {
          return query(args);
        }

        const startedAt = performance.now();
        const result = await query(args);
        const durationMilliseconds = performance.now() - startedAt;

        if (durationMilliseconds >= slowQueryThresholdMilliseconds) {
          onSlowQuery({
            ...(model ? { model } : {}),
            operation,
            durationMilliseconds: Math.round(durationMilliseconds * 100) / 100,
          });
        }

        return result;
      },
    },
  });
}
