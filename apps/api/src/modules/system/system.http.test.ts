import assert from "node:assert/strict";
import { test } from "node:test";
import { createApiApplication } from "../../app.js";

test("GET /v1/system/health serves the contract response over Fastify", async () => {
  const app = await createApiApplication();

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
