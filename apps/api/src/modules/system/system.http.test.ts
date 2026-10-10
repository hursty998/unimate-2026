import assert from "node:assert/strict";
import { test } from "node:test";
import { parseNodeObservabilityConfig } from "@unimate/observability/node";
import { createApiApplication } from "../../app.js";

test("GET /v1/system/health serves the contract response over Fastify", async () => {
  const app = await createApiApplication({
    host: "127.0.0.1",
    port: 3000,
    nodeEnv: "test",
    corsOrigins: [],
    databaseUrl: "postgresql://localhost/postgres?schema=app",
    supabaseUrl: "http://127.0.0.1:55321",
    supabaseJwtAudience: "authenticated",
    supabaseSecretKey: "sb_secret_test-only",
    supabaseStorageBucket: "foundation-storage-proof",
    observability: parseNodeObservabilityConfig({ NODE_ENV: "test" }),
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/system/health",
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"] ?? "", /^application\/json/);
    assert.deepEqual(response.json(), {
      status: "ok",
      service: "unimate-api",
      apiVersion: "v1",
    });
  } finally {
    await app.close();
  }
});

test("readiness is public and the synthetic observability route is never production", async () => {
  const config = {
    host: "127.0.0.1",
    port: 3000,
    corsOrigins: [],
    databaseUrl: "postgresql://127.0.0.1:1/postgres?schema=app",
    supabaseUrl: "http://127.0.0.1:55321",
    supabaseJwtAudience: "authenticated",
    supabaseSecretKey: "sb_secret_test-only",
    supabaseStorageBucket: "foundation-storage-proof",
  };
  const developmentApp = await createApiApplication({
    ...config,
    nodeEnv: "test",
    observability: parseNodeObservabilityConfig({ NODE_ENV: "test" }),
  });

  try {
    const unauthenticatedProof = await developmentApp.inject({
      method: "POST",
      url: "/v1/foundation/observability-proof",
      payload: {},
    });
    assert.equal(unauthenticatedProof.statusCode, 401);
  } finally {
    await developmentApp.close();
  }

  const productionApp = await createApiApplication({
    ...config,
    nodeEnv: "production",
    observability: parseNodeObservabilityConfig({
      NODE_ENV: "production",
      OBSERVABILITY_LOG_LEVEL: "silent",
    }),
  });

  try {
    const productionProof = await productionApp.inject({
      method: "POST",
      url: "/v1/foundation/observability-proof",
      payload: {},
    });
    assert.equal(productionProof.statusCode, 404);
  } finally {
    await productionApp.close();
  }
});

test("readiness returns 503 without exposing PostgreSQL details", async () => {
  const app = await createApiApplication({
    host: "127.0.0.1",
    port: 3000,
    nodeEnv: "test",
    corsOrigins: [],
    databaseUrl: "postgresql://127.0.0.1:1/postgres?schema=app",
    supabaseUrl: "http://127.0.0.1:55321",
    supabaseJwtAudience: "authenticated",
    supabaseSecretKey: "sb_secret_test-only",
    supabaseStorageBucket: "foundation-storage-proof",
    observability: parseNodeObservabilityConfig({ NODE_ENV: "test" }),
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/system/readiness",
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { status: "not_ready" });
    assert.equal(response.body.includes("127.0.0.1"), false);
    assert.equal(response.body.includes("postgres"), false);
  } finally {
    await app.close();
  }
});
