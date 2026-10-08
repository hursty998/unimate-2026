import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Controller, Get, Module, type DynamicModule } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import type { AccessTokenVerifier } from "@unimate/auth";
import {
  Capabilities,
  type AuthorizationScope,
  type Capability,
} from "@unimate/authorization";
import { Authenticated } from "../auth/access-posture.decorator.js";
import {
  ACCESS_TOKEN_VERIFIER,
  AuthenticationGuard,
} from "../auth/authentication.guard.js";
import type { AuthenticatedPrincipal } from "../auth/authenticated-principal.js";
import { AuthorizationGuard } from "./authorization.guard.js";
import { RequireCapability } from "./require-capability.decorator.js";
import { AuthorizationService } from "./authorization.service.js";

const validPrincipal: AuthenticatedPrincipal = {
  provider: "SUPABASE",
  providerSubject: "test:authorization-guard",
};

const tokenVerifier: AccessTokenVerifier = {
  async verify(token) {
    if (token !== "valid-test-token") {
      throw new Error("Sensitive verifier details");
    }

    return validPrincipal;
  },
};

@Controller("test-only")
class AuthorizationGuardTestController {
  @Get("authenticated")
  @Authenticated()
  authenticated() {
    return { allowed: true };
  }

  @Get("capability")
  @RequireCapability(Capabilities.PLATFORM_AUTHORIZATION_MANAGE)
  capability() {
    return { allowed: true };
  }
}

@Module({})
class AuthorizationGuardTestModule {
  static register(
    authorization: Pick<AuthorizationService, "can">,
  ): DynamicModule {
    return {
      module: AuthorizationGuardTestModule,
      controllers: [AuthorizationGuardTestController],
      providers: [
        AuthorizationGuard,
        {
          provide: AuthorizationService,
          useValue: authorization,
        },
        {
          provide: ACCESS_TOKEN_VERIFIER,
          useValue: tokenVerifier,
        },
        {
          provide: APP_GUARD,
          useClass: AuthenticationGuard,
        },
      ],
    };
  }
}

async function createTestApplication(
  authorization: Pick<AuthorizationService, "can">,
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AuthorizationGuardTestModule.register(authorization),
    new FastifyAdapter(),
    { logger: false },
  );
  await app.init();
  return app;
}

function captureAuthorizationCalls() {
  const calls: Array<{
    principal: AuthenticatedPrincipal;
    capability: Capability;
    scope: AuthorizationScope;
  }> = [];

  return {
    calls,
    authorization: {
      async can(
        principal: AuthenticatedPrincipal,
        capability: Capability,
        scope: AuthorizationScope,
      ) {
        calls.push({ principal, capability, scope });
        return true;
      },
    } satisfies Pick<AuthorizationService, "can">,
  };
}

test("authenticated-only routes do not invoke authorization without capability metadata", async () => {
  const { calls, authorization } = captureAuthorizationCalls();
  const app = await createTestApplication(authorization);

  try {
    const response = await app.inject({
      method: "GET",
      url: "/test-only/authenticated",
      headers: { authorization: "Bearer valid-test-token" },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { allowed: true });
    assert.equal(calls.length, 0);
  } finally {
    await app.close();
  }
});

test("the typed capability route reaches the authorization service and allows a grant", async () => {
  const { calls, authorization } = captureAuthorizationCalls();
  const app = await createTestApplication(authorization);

  try {
    const response = await app.inject({
      method: "GET",
      url: "/test-only/capability",
      headers: { authorization: "Bearer valid-test-token" },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls, [
      {
        principal: validPrincipal,
        capability: Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
        scope: { kind: "PLATFORM" },
      },
    ]);
  } finally {
    await app.close();
  }
});

test("authentication runs before capability authorization and preserves 401 semantics", async () => {
  const { calls, authorization } = captureAuthorizationCalls();
  const app = await createTestApplication(authorization);

  try {
    for (const headers of [
      {},
      { authorization: "Bearer invalid-test-token" },
    ]) {
      const response = await app.inject({
        method: "GET",
        url: "/test-only/capability",
        headers,
      });

      assert.equal(response.statusCode, 401);
    }

    assert.equal(calls.length, 0);
  } finally {
    await app.close();
  }
});

test("authenticated actors without a grant receive 403", async () => {
  const authorization: Pick<AuthorizationService, "can"> = {
    async can() {
      return false;
    },
  };
  const app = await createTestApplication(authorization);

  try {
    const response = await app.inject({
      method: "GET",
      url: "/test-only/capability",
      headers: { authorization: "Bearer valid-test-token" },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.includes("role"), false);
    assert.equal(response.body.includes("assignment"), false);
  } finally {
    await app.close();
  }
});

test("authorization service failures return a generic 500 without leaking details", async () => {
  const authorization: Pick<AuthorizationService, "can"> = {
    async can() {
      throw new Error("sensitive database connection details");
    },
  };
  const app = await createTestApplication(authorization);

  try {
    const response = await app.inject({
      method: "GET",
      url: "/test-only/capability",
      headers: { authorization: "Bearer valid-test-token" },
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.body.includes("sensitive database"), false);
  } finally {
    await app.close();
  }
});

function assertRequireCapabilityTypes(): void {
  RequireCapability(Capabilities.PLATFORM_AUTHORIZATION_MANAGE);

  // @ts-expect-error University capabilities need a real University scope route.
  RequireCapability(Capabilities.UNIVERSITY_AUTHORIZATION_MANAGE);

  // @ts-expect-error Unknown strings are not catalogue capabilities.
  RequireCapability("platform.authorization.manage.extra");
}

void assertRequireCapabilityTypes;
