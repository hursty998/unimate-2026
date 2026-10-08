import assert from "node:assert/strict";
import { test } from "node:test";
import { parseApiConfig } from "./environment.js";

test("API configuration validates untrusted environment values", () => {
  assert.throws(() => parseApiConfig({ API_PORT: "70000" }), {
    name: "ZodError",
  });
  assert.throws(
    () => parseApiConfig({ API_CORS_ORIGINS: "https://example.com/path" }),
    { name: "ZodError" },
  );
});

test("API configuration supplies the documented local defaults", () => {
  assert.deepEqual(parseApiConfig({}), {
    host: "0.0.0.0",
    port: 3000,
    nodeEnv: "development",
    corsOrigins: [],
  });
});
