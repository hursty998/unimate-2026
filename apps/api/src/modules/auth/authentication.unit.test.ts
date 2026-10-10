import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthMeResponse } from "@unimate/contracts";
import { parseNodeObservabilityConfig } from "@unimate/observability/node";
import { createApiApplication } from "../../app.js";
import type { ApiConfig } from "../../config/environment.js";
import type { AuthMeService } from "./auth-me.service.js";

const config: ApiConfig = {
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
};

const expectedUser: AuthMeResponse = {
  user: { id: "f0000000-0000-7000-8000-000000000001" },
  universityAffiliations: [],
};

test("public system health succeeds without credentials", async () => {
  const app = await createApiApplication(config, {
    tokenVerifier: {
      verify: async () => {
        throw new Error("The public health route must not verify a token.");
      },
    },
    authMeService: {
      getMe: async () => expectedUser,
    } satisfies Pick<AuthMeService, "getMe">,
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/system/health",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      status: "ok",
      service: "unimate-api",
      apiVersion: "v1",
    });
  } finally {
    await app.close();
  }
});

test("authenticated route rejects missing and malformed bearer credentials", async () => {
  const app = await createApiApplication(config, {
    tokenVerifier: {
      verify: async () => ({
        provider: "SUPABASE",
        providerSubject: "must-not-be-used",
      }),
    },
    authMeService: {
      getMe: async () => expectedUser,
    } satisfies Pick<AuthMeService, "getMe">,
  });

  test("storage-proof upload authorisation requires a valid bearer token", async () => {
    const app = await createApiApplication(config, {
      tokenVerifier: {
        verify: async () => {
          throw new Error("The storage-proof service must not run.");
        },
      },
      authMeService: {
        getMe: async () => expectedUser,
      } satisfies Pick<AuthMeService, "getMe">,
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/foundation/storage-proof/uploads/issue",
        payload: {},
      });

      assert.equal(response.statusCode, 401);
      assert.equal(response.body.includes("storage-proof service"), false);
    } finally {
      await app.close();
    }
  });

  try {
    for (const authorization of [
      undefined,
      "Basic valid-token",
      "Bearer",
      "Bearer token with-spaces",
    ]) {
      const response = await app.inject({
        method: "GET",
        url: "/v1/auth/me",
        headers: authorization ? { authorization } : {},
      });

      assert.equal(response.statusCode, 401, authorization);
    }
  } finally {
    await app.close();
  }
});

test("verifier failures return a safe 401 response", async () => {
  let serviceCalled = false;
  const app = await createApiApplication(config, {
    tokenVerifier: {
      verify: async () => {
        throw new Error("sensitive provider verifier details");
      },
    },
    authMeService: {
      getMe: async () => {
        serviceCalled = true;
        return expectedUser;
      },
    } satisfies Pick<AuthMeService, "getMe">,
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { authorization: "Bearer invalid-token" },
    });

    assert.equal(response.statusCode, 401);
    assert.equal(response.body.includes("sensitive provider"), false);
    assert.equal(serviceCalled, false);
  } finally {
    await app.close();
  }
});

test("a verified principal reaches the identity application service", async () => {
  const receivedPrincipals: Array<{
    provider: "SUPABASE";
    providerSubject: string;
  }> = [];
  const app = await createApiApplication(config, {
    tokenVerifier: {
      verify: async (token) => {
        assert.equal(token, "valid-test-token");
        return {
          provider: "SUPABASE",
          providerSubject: "verified-provider-subject",
        };
      },
    },
    authMeService: {
      getMe: async (principal) => {
        receivedPrincipals.push(principal);
        return expectedUser;
      },
    } satisfies Pick<AuthMeService, "getMe">,
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { authorization: "Bearer valid-test-token" },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), expectedUser);
    assert.deepEqual(receivedPrincipals, [
      {
        provider: "SUPABASE",
        providerSubject: "verified-provider-subject",
      },
    ]);
  } finally {
    await app.close();
  }
});
