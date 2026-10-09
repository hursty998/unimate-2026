import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthMeResponse } from "@unimate/contracts";
import { createApiApplication } from "../../app.js";
import { parseApiConfig } from "../../config/environment.js";
import type { AuthMeService } from "../auth/auth-me.service.js";

const productionConfig = parseApiConfig({
  NODE_ENV: "production",
  API_HOST: "127.0.0.1",
  DATABASE_URL: "postgresql://localhost/postgres?schema=app",
  SUPABASE_URL: "https://auth.unimate.example",
});

test("production API starts without proof storage configuration and does not register proof routes", async () => {
  const authMe: AuthMeResponse = {
    user: { id: "f0000000-0000-7000-8000-000000000001" },
    universityAffiliations: [],
  };
  const app = await createApiApplication(productionConfig, {
    tokenVerifier: {
      verify: async () => ({
        provider: "SUPABASE",
        providerSubject: "production-test-principal",
      }),
    },
    authMeService: {
      getMe: async () => authMe,
    } satisfies Pick<AuthMeService, "getMe">,
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/foundation/storage-proof/uploads/issue",
      headers: { authorization: "Bearer production-test-token" },
      payload: {},
    });

    assert.equal(response.statusCode, 404);
  } finally {
    await app.close();
  }
});
