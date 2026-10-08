export const AuthorizationScopeKinds = {
  PLATFORM: "PLATFORM",
  UNIVERSITY: "UNIVERSITY",
} as const;

export type AuthorizationScopeKind =
  (typeof AuthorizationScopeKinds)[keyof typeof AuthorizationScopeKinds];

export const Capabilities = {
  PLATFORM_AUTHORIZATION_MANAGE: "platform.authorization.manage",
  UNIVERSITY_AUTHORIZATION_MANAGE: "university.authorization.manage",
} as const;

export const CapabilityDefinitions = [
  {
    key: Capabilities.PLATFORM_AUTHORIZATION_MANAGE,
    scopeKind: AuthorizationScopeKinds.PLATFORM,
  },
  {
    key: Capabilities.UNIVERSITY_AUTHORIZATION_MANAGE,
    scopeKind: AuthorizationScopeKinds.UNIVERSITY,
  },
] as const;

export type CapabilityDefinition = (typeof CapabilityDefinitions)[number];
export type Capability = CapabilityDefinition["key"];

export type CapabilityForScope<ScopeKind extends AuthorizationScopeKind> =
  Extract<CapabilityDefinition, { scopeKind: ScopeKind }>["key"];

export type PlatformCapability = CapabilityForScope<
  typeof AuthorizationScopeKinds.PLATFORM
>;

export type AuthorizationScope =
  | { kind: typeof AuthorizationScopeKinds.PLATFORM }
  | {
      kind: typeof AuthorizationScopeKinds.UNIVERSITY;
      universityId: string;
    };

export function getCapabilityDefinition(
  value: unknown,
): CapabilityDefinition | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return CapabilityDefinitions.find(({ key }) => key === value);
}

export function isCapability(value: unknown): value is Capability {
  return getCapabilityDefinition(value) !== undefined;
}

export function capabilitySupportsScope(
  capability: unknown,
  scopeKind: AuthorizationScopeKind,
): boolean {
  return getCapabilityDefinition(capability)?.scopeKind === scopeKind;
}

export function isCapabilityForScope<ScopeKind extends AuthorizationScopeKind>(
  value: unknown,
  scopeKind: ScopeKind,
): value is CapabilityForScope<ScopeKind> {
  return capabilitySupportsScope(value, scopeKind);
}

export function isAuthorizationScope(
  value: unknown,
): value is AuthorizationScope {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    return false;
  }

  if (value.kind === AuthorizationScopeKinds.PLATFORM) {
    return !("universityId" in value);
  }

  return (
    value.kind === AuthorizationScopeKinds.UNIVERSITY &&
    "universityId" in value &&
    typeof value.universityId === "string" &&
    value.universityId.length > 0
  );
}

export function authorizationScopesEqual(
  left: AuthorizationScope,
  right: AuthorizationScope,
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  if (
    left.kind === AuthorizationScopeKinds.PLATFORM &&
    right.kind === AuthorizationScopeKinds.PLATFORM
  ) {
    return true;
  }

  return (
    left.kind === AuthorizationScopeKinds.UNIVERSITY &&
    right.kind === AuthorizationScopeKinds.UNIVERSITY &&
    left.universityId === right.universityId
  );
}
