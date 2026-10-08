# Phase 6 — Authorisation + Capability Foundation

**Status:** Complete  
**Started:** 2026-10-08  
**Completed:** 2026-10-08

## Baseline and approved direction

- The checkout is `/Users/henry/Documents/Projects/UniMates-2026/unimate-2026`, on `development`, with the expected GitHub origin and a clean worktree. Phase 5 and its hardening are committed.
- Local Supabase is healthy, PostgreSQL at `127.0.0.1:55322` accepts connections, and Prisma reports the existing migration set current.
- The approved Phase 6 section in `FOUNDATION_IMPLEMENTATION_PLAN.md` calls for a capability guard/catalogue, an AuthorisationService/policy boundary, explicit route access posture, resource-policy separation, and tests. It does not conflict with this task's narrower platform/university-only persistence and no-product-endpoint scope.
- Authentication remains Supabase JWT verification plus `AuthIdentity(provider, providerSubject) → User`; authorisation will resolve this existing identity and will never provision one.

## Decisions

### Capability source and package boundary

- Create the pure semantic package at `packages/authorization`, published within the workspace as `@unimate/authorization`.
- Keep its catalogue, capability/scope types, exact-key lookup, and scope helpers independent of NestJS, Prisma, PostgreSQL, Supabase, contracts, and mobile code.
- Define only `platform.authorization.manage` (`PLATFORM`) and `university.authorization.manage` (`UNIVERSITY`). The university-scoped capability is the minimal stable authorisation-management action needed to exercise real University-scoped grants and isolation; no future product-domain catalogue is included.
- Derive `Capability` and platform-scoped capability types from the catalogue. Unknown keys, prefixes, and wildcard strings are not capabilities.

### Persistence and scope integrity

- Extend only the Prisma-owned `app` schema with `Role`, `RoleCapability`, `RoleAssignment`, and `CapabilityAssignment`; do not add a capability table.
- Persist only `PLATFORM` and `UNIVERSITY` scope kinds. University assignments use a nullable `University` foreign key; database CHECK constraints require it to be null for PLATFORM and non-null for UNIVERSITY.
- Roles are mutable data, unique by `(scopeKind, key)`. Role mappings store exact capability keys as text and are unique by `(roleId, capability)`. Role name/key never participates in decisions.
- Role and direct assignments cascade with User deletion. Role mappings/assignments cascade with Role deletion. University assignments cascade with University deletion.
- Use UUIDv7 identifiers and `timestamptz(6)`. PostgreSQL partial unique indexes enforce logical uniqueness for PLATFORM and UNIVERSITY assignments; ordinary NULL-distinct uniqueness would permit duplicate PLATFORM rows. Add indexes for user/scope resolution and foreign-key cascade paths.
- Runtime resolution additionally requires `Role.scopeKind === RoleAssignment.scopeKind`; capability catalogue metadata must agree with the requested and persisted scope.
- Do not seed Roles, mappings, or assignments. No user, seed fixture, affiliation, provider metadata, or JWT receives privileges by default.

### API resolution and enforcement

- Add `AuthorizationService.can(principal, capability, scope)` in the API module. It checks the exact known capability/scope pair, finds the existing `AuthIdentity`, and uses one bounded relational existence query for either a direct grant or a role-derived grant. A missing identity, unknown key, mismatched scope, or absent grant denies.
- No role/capability cache, JWT claim, Supabase metadata, RLS policy, automatic provisioning, or generic policy-rule engine is introduced.
- Register a separate `AuthorizationGuard` and a `@RequireCapability` decorator typed to platform-scoped catalogue entries. The decorator applies the guard to the route. Nest's global `AuthenticationGuard` remains first; unauthenticated/invalid requests are 401, authenticated denials are 403, and service failures become a generic 500 without exposing database details.
- Mark `/v1/system/health` explicitly public and `/v1/auth/me` explicitly authenticated, then structurally test that each production controller operation declares an access posture. `/auth/me` remains independent of assignments.
- Future feature modules import the API authorization module for capability-guarded routes. Route capability checks remain coarse; the owning application service loads the resource and applies its feature-local policy before access or mutation.
- Keep current production operations unchanged; guard behaviour is exercised with test-only Nest controllers, never a fake production endpoint.
- Keep a single process-scoped Prisma client by registering the global `DatabaseModule` at API composition. This lets identity and authorisation share the same existing client; provider authentication, token verification, and identity semantics are unchanged.

### Package, migration, tests, and verification

- Follow the existing pure TypeScript workspace package pattern. Add no runtime dependency. The package participates in build/lint/typecheck/test through its workspace scripts and package dependency graph; `verify:changed` remains database-free.
- Create and apply `20261008170507_authorization_foundation` with Prisma Migrate. Review generated SQL before applying it. The only raw SQL adds the two scope CHECK constraints and four per-scope partial unique indexes, which Prisma schema cannot express.
- Add pure catalogue tests, focused API guard/access-posture tests, and real local PostgreSQL integration tests for direct and role grants, default deny, unknown data, scope mismatch/isolation, duplicate protection, cascades, and important physical schema invariants. Update the existing `app` table inventory assertion to include the four new authorisation tables.
- Add `pnpm authorization:test`, restricted to matching loopback `DATABASE_URL` and `DIRECT_URL`; ordinary `pnpm test` remains fast. Include the integration command in full `pnpm verify`, not `verify:changed`.
- Prove migration-from-zero with the repository's loopback-protected `pnpm db:reset`, after requesting the required immediate confirmation. Both Phase 4 and Phase 6 migrations reapplied; the seed ran during reset and a second run was idempotent. Verification found two development Users, one affiliation, no Role or grant rows, `_prisma_migrations` in `app`, and retained Supabase `auth`/`storage` schemas.

## Validation evidence

- `pnpm install --frozen-lockfile`, `pnpm format`, `pnpm format:check`, `pnpm lint`, Prisma format/validate/generate/status, `pnpm typecheck`, `pnpm build`, OpenAPI generation, and ordinary `pnpm test` passed.
- `pnpm db:test` passed against local PostgreSQL. `pnpm authorization:test` passed the real-PostgreSQL deny, direct grant, role grant, unknown-key, role/capability scope mismatch, University isolation, duplicate assignment, deletion cascade, and physical schema assertions.
- API tests passed for access posture, public health, authenticated identity, capability allow/deny, authentication-before-authorisation, 401/403 semantics, and safe service-error handling. Pure catalogue tests passed for exact keys, scope metadata, wildcard/prefix rejection, and scope equality.
- `pnpm auth:test` passed the existing local Supabase Auth/identity integration; no Auth redesign was required.
- `pnpm verify` and `pnpm verify:changed` passed. `git diff --check` passed. `pnpm git-diff` generated the review report; a targeted scan found no credentials, tokens, or database URLs in the generated diff.
- The post-reset local Supabase status remained healthy and PostgreSQL accepted connections. No hosted Supabase, native, or EAS operations were performed.

## Deviations and deferred work

- Added one University-scoped authorisation-management capability so PostgreSQL integration tests exercise a real University scope and exact A-versus-B isolation. No product-domain capability catalogue was added.
- Moved API database-module registration to the application composition root so the Auth identity service and AuthorizationService share one Prisma client. This is dependency-injection wiring only; the verified Supabase authentication architecture and `/auth/me` behaviour are unchanged.
- No open Phase 6 decisions or acceptance blockers remain. Product roles, role-management endpoints/UI, resource policies, additional scopes, and Phase 7 remain deferred.
