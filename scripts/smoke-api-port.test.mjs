import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BROWSER_SMOKE_API_PORT,
  assertDedicatedSmokeApiPortAvailable,
  isOwnedSmokeApiListener,
} from "./smoke-api-port.mjs";

test("browser smoke refuses to reuse an occupied API port even for this checkout", () => {
  const existingApi = {
    pid: "12345",
    cwd: "/repo/apps/api",
    command: "node dist/main.js",
  };

  assert.throws(
    () =>
      assertDedicatedSmokeApiPortAvailable(BROWSER_SMOKE_API_PORT, false, [
        existingApi,
      ]),
    /occupied.*No process was reused or stopped/,
  );
});

test("browser smoke starts its API only on an available dedicated port", () => {
  assert.doesNotThrow(() =>
    assertDedicatedSmokeApiPortAvailable(BROWSER_SMOKE_API_PORT, true, []),
  );
});

test("browser smoke fails closed when a port is unavailable but owner lookup is empty", () => {
  assert.throws(
    () =>
      assertDedicatedSmokeApiPortAvailable(BROWSER_SMOKE_API_PORT, false, []),
    new RegExp(
      `Dedicated browser-smoke API port ${BROWSER_SMOKE_API_PORT} is occupied`,
    ),
  );
});

test("API health belongs to the exact process started by the smoke harness", () => {
  const owner = {
    pid: "12345",
    cwd: "/repo/apps/api",
    command: "node dist/main.js",
  };

  assert.equal(isOwnedSmokeApiListener(owner, 12345, "/repo/apps/api"), true);
  assert.equal(isOwnedSmokeApiListener(owner, 12346, "/repo/apps/api"), false);
  assert.equal(isOwnedSmokeApiListener(owner, 12345, "/other/apps/api"), false);
  assert.equal(
    isOwnedSmokeApiListener(
      { ...owner, command: "node another-server.js" },
      12345,
      "/repo/apps/api",
    ),
    false,
  );
});
