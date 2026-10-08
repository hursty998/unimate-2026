import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRouterClient } from "@orpc/server";
import { createSystemHealthProcedure } from "./system.controller.js";
import { SystemService } from "./system.service.js";

test("the system health implementation returns a contract-valid response", async () => {
  const client = createRouterClient({
    system: {
      health: createSystemHealthProcedure(new SystemService()),
    },
  });

  assert.deepEqual(await client.system.health(), {
    status: "ok",
    service: "unimate-api",
    apiVersion: "v1",
  });
});
