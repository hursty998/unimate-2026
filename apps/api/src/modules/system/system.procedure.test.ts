import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRouterClient } from "@orpc/server";
import type { StructuredLogger } from "@unimate/observability";
import { createSystemHealthProcedure } from "./system.controller.js";
import { SystemService } from "./system.service.js";

const logger: StructuredLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

test("the system health implementation returns a contract-valid response", async () => {
  const client = createRouterClient({
    system: {
      health: createSystemHealthProcedure(
        new SystemService({ check: async () => {} }, logger),
      ),
    },
  });

  assert.deepEqual(await client.system.health(), {
    status: "ok",
    service: "unimate-api",
    apiVersion: "v1",
  });
});

test("readiness failure logs only a safe category and does not report an exception", async () => {
  const logs: Array<{
    event: string;
    fields?: Readonly<Record<string, unknown>>;
  }> = [];
  const service = new SystemService(
    {
      async check() {
        throw new Error("private database connection failure");
      },
    },
    {
      debug() {},
      info() {},
      warn(event, fields) {
        logs.push({ event, ...(fields ? { fields } : {}) });
      },
      error() {},
    },
  );

  assert.equal(await service.readiness(), false);
  assert.deepEqual(logs, [
    { event: "system.readiness.failed", fields: { error_type: "Error" } },
  ]);
  assert.equal(JSON.stringify(logs).includes("private-password"), false);
});
