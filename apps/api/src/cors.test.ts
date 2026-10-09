import assert from "node:assert/strict";
import { test } from "node:test";
import { createApiApplication } from "./app.js";

test("CORS allows the API method set without widening configured origins", async () => {
  const allowedOrigin = "https://app.unimate.example";
  const app = await createApiApplication({
    host: "127.0.0.1",
    port: 3000,
    nodeEnv: "production",
    corsOrigins: [allowedOrigin],
    databaseUrl: "postgresql://localhost/postgres?schema=app",
    supabaseUrl: "http://127.0.0.1:55321",
    supabaseJwtAudience: "authenticated",
    supabaseSecretKey: "sb_secret_test-only",
    supabaseStorageBucket: "foundation-storage-proof",
  });

  try {
    const allowedPreflight = await app.inject({
      method: "OPTIONS",
      url: "/v1/system/health",
      headers: {
        origin: allowedOrigin,
        "access-control-request-method": "PATCH",
      },
    });

    assert.equal(allowedPreflight.statusCode, 204);
    assert.equal(
      allowedPreflight.headers["access-control-allow-origin"],
      allowedOrigin,
    );
    assert.deepEqual(
      allowedPreflight.headers["access-control-allow-methods"]
        ?.split(",")
        .map((method) => method.trim()),
      ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    );

    const deniedPreflight = await app.inject({
      method: "OPTIONS",
      url: "/v1/system/health",
      headers: {
        origin: "https://untrusted.example",
        "access-control-request-method": "PATCH",
      },
    });

    assert.equal(deniedPreflight.statusCode, 204);
    assert.equal(
      deniedPreflight.headers["access-control-allow-origin"],
      undefined,
    );
  } finally {
    await app.close();
  }
});
