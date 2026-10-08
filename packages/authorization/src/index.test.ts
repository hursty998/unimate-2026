import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authorizationScopesEqual,
  capabilitySupportsScope,
  Capabilities,
  getCapabilityDefinition,
  isAuthorizationScope,
  isCapability,
  isCapabilityForScope,
} from "./index.js";

test("the catalogue recognises only exact known capability keys", () => {
  assert.equal(isCapability(Capabilities.PLATFORM_AUTHORIZATION_MANAGE), true);
  assert.equal(
    isCapability(Capabilities.UNIVERSITY_AUTHORIZATION_MANAGE),
    true,
  );
  assert.equal(isCapability("platform.authorization.manage.extra"), false);
  assert.equal(isCapability("platform.*"), false);
  assert.equal(isCapability("*"), false);
  assert.equal(isCapability("platform.unknown.manage"), false);
});

test("capability definitions declare their only valid scope kind", () => {
  assert.deepEqual(
    getCapabilityDefinition(Capabilities.PLATFORM_AUTHORIZATION_MANAGE),
    {
      key: Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
      scopeKind: "PLATFORM",
    },
  );
  assert.deepEqual(
    getCapabilityDefinition(Capabilities.UNIVERSITY_AUTHORIZATION_MANAGE),
    {
      key: Capabilities.UNIVERSITY_AUTHORIZATION_MANAGE,
      scopeKind: "UNIVERSITY",
    },
  );
  assert.equal(
    capabilitySupportsScope(
      Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
      "UNIVERSITY",
    ),
    false,
  );
  assert.equal(
    capabilitySupportsScope(
      Capabilities.UNIVERSITY_AUTHORIZATION_MANAGE,
      "UNIVERSITY",
    ),
    true,
  );
  assert.equal(
    isCapabilityForScope(
      Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
      "PLATFORM",
    ),
    true,
  );
  assert.equal(getCapabilityDefinition("platform.unknown.manage"), undefined);
});

test("scope validation and equality preserve exact University isolation", () => {
  const universityA = {
    kind: "UNIVERSITY" as const,
    universityId: "university-a",
  };

  assert.equal(isAuthorizationScope({ kind: "PLATFORM" }), true);
  assert.equal(
    isAuthorizationScope({
      kind: "PLATFORM",
      universityId: "university-a",
    }),
    false,
  );
  assert.equal(authorizationScopesEqual(universityA, universityA), true);
  assert.equal(
    authorizationScopesEqual(universityA, {
      kind: "UNIVERSITY",
      universityId: "university-b",
    }),
    false,
  );
  assert.equal(
    authorizationScopesEqual(universityA, { kind: "PLATFORM" }),
    false,
  );
});
