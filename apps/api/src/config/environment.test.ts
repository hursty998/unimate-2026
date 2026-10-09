import assert from "node:assert/strict";
import { test } from "node:test";
import { parseApiConfig } from "./environment.js";

test("API configuration validates untrusted environment values", () => {
  assert.throws(() => parseApiConfig({ API_PORT: "70000" }), {
    name: "ZodError",
  });
  assert.throws(() => parseApiConfig({ SUPABASE_URL: "not-a-url" }), {
    name: "ZodError",
  });
  assert.throws(
    () => parseApiConfig({ API_CORS_ORIGINS: "https://example.com/path" }),
    { name: "ZodError" },
  );
  assert.throws(
    () =>
      parseApiConfig({
        SUPABASE_SECRET_KEY: "service-role-key",
        SUPABASE_STORAGE_BUCKET: "../invalid",
      }),
    { name: "ZodError" },
  );
});

test("API configuration supplies the documented local defaults", () => {
  assert.deepEqual(
    parseApiConfig({
      DATABASE_URL: "postgresql://localhost/postgres?schema=app",
      SUPABASE_URL: "http://127.0.0.1:55321",
      SUPABASE_SECRET_KEY: "sb_secret_test-only",
      SUPABASE_STORAGE_BUCKET: "foundation-storage-proof",
    }),
    {
      host: "0.0.0.0",
      port: 3000,
      nodeEnv: "development",
      corsOrigins: [],
      databaseUrl: "postgresql://localhost/postgres?schema=app",
      supabaseUrl: "http://127.0.0.1:55321",
      supabaseJwtAudience: "authenticated",
      supabaseSecretKey: "sb_secret_test-only",
      supabaseStorageBucket: "foundation-storage-proof",
    },
  );
});

test("production API configuration accepts blank proof-storage settings", () => {
  const config = parseApiConfig({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://localhost/postgres?schema=app",
    SUPABASE_URL: "https://auth.unimate.example",
    SUPABASE_SECRET_KEY: "",
    SUPABASE_STORAGE_BUCKET: "",
  });

  assert.equal(config.supabaseSecretKey, undefined);
  assert.equal(config.supabaseStorageBucket, undefined);
});

test("non-production API configuration requires foundation storage settings", () => {
  assert.throws(
    () =>
      parseApiConfig({
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://localhost/postgres?schema=app",
        SUPABASE_URL: "http://127.0.0.1:55321",
      }),
    { name: "ZodError" },
  );
});
