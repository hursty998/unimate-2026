# Phase 5 — Authentication + Identity Foundation

**Status:** Complete  
**Started:** 2026-10-08
**Completed:** 2026-10-08

## Baseline and decisions

- The physical checkout is `/Users/henry/Documents/Projects/UniMates-2026/unimate-2026`, on `development`, with the expected `origin` and a clean worktree. Phase 4 and connection-safety hardening are committed.
- Local Supabase CLI is 2.104.0. Its project is healthy on API port 55321 and PostgreSQL port 55322. `pnpm db:check` passed; the Phase 4 migration is current.
- npm registry stable versions: `@supabase/supabase-js` 2.117.3, `jose` 6.2.12, and `react-native-url-polyfill` 4.0.0. Pin exact versions; do not use Supabase JS v3/next.
- A genuine local Auth user access token was inspected and the temporary Auth user deleted. Non-secret token properties: `ES256`, a `kid`, issuer `http://127.0.0.1:55321/auth/v1`, audience `authenticated`, a non-empty `sub` matching the provider user, and `exp`; `nbf` was absent. Local discovery and JWKS endpoints returned HTTP 200; JWKS advertised one ES256 public key. Supabase JWT documentation lists ES256 and RS256 as the supported asymmetric algorithms, and both are accepted by the verifier.
- `jose` remote JWKS verification derives issuer and JWKS URL from server-only `SUPABASE_URL`, validates issuer/audience/expiry/not-before/subject, and never uses a shared JWT signing secret or calls Auth per request. JWKS uses jose's remote resolver with in-memory caching and rotation refresh on an unknown key.
- Expo SDK 57 already includes `expo-secure-store`; no native dependency was added. The observed local session serialized to 2,083 bytes, exceeding Expo SecureStore's documented historical ~2,048-byte per-value limit. Native session material stays in SecureStore, split into UTF-8-safe chunks no larger than 1,800 bytes with a generation manifest committed last. Auxiliary Supabase Auth storage keys use the same protected adapter. Web uses `localStorage` and is documented as less secure than native storage.
- Mobile Supabase JS imports stay in `apps/mobile/src/lib/auth/`. The client is Auth-only. The provider owns Supabase session state; TanStack Query owns `/v1/auth/me`.
- Nest uses authenticated-by-default access posture, an explicit public health exception, a typed principal, and a local `jose` verifier. `/v1/auth/me` lazily provisions the `(SUPABASE, sub)` identity and User in one PostgreSQL transaction; unique-conflict recovery re-reads the winning identity after rollback.
- The contract exposes only the UniMate User UUID and university affiliation UUIDs. A newly authenticated user may have an empty affiliation list.
- Normal unit/API tests must not need Supabase or PostgreSQL. Separate real-PostgreSQL provisioning and local-Supabase Auth integration commands will exercise race safety, refresh, provider-user cleanup, and the full route.

## Implementation and validation

- [x] Add `packages/auth` verifier and deterministic asymmetric-JWKS unit tests.
- [x] Add typed `/v1/auth/me` contract, default-deny guard, process-scoped Prisma lifecycle, and transactional identity provisioning.
- [x] Add real-PostgreSQL provisioning coverage and explicit local Supabase Auth integration with test-only credentials isolated from API runtime configuration.
- [x] Add mobile Auth adapter/session provider, native protected storage, dynamic bearer transport, query lifecycle, and foundation sign-in UI.
- [x] Add concise authentication guidance, auth package rules, environment examples, and targeted import restrictions.
- [x] Run focused and full checks; regenerate OpenAPI.
- [x] Verify web, existing iOS development client, and existing Android development client, including session restoration and sign-out.
- [x] Scan the final change for credentials and confirm no native/EAS build, hosted Supabase operation, commit, or push occurred.

## Evidence and deviations

- `pnpm install --frozen-lockfile`, `pnpm db:check`, Prisma Client generation, Expo dependency compatibility, formatting, lint, typecheck, build, ordinary tests, PostgreSQL integration tests, local Auth integration, OpenAPI generation, `pnpm verify`, `pnpm verify:changed`, `git diff --check`, and `pnpm git-diff` passed.
- Deterministic verifier tests cover valid ES256 and RS256 tokens, verified subject extraction, issuer/audience mismatch, expiry, future not-before, missing/empty subject, malformed token, an untrusted signing key, and rejection of HS256.
- API tests prove public health without credentials, missing/malformed/invalid credentials returning 401, no provider-error leakage, and the verified principal reaching the identity service.
- PostgreSQL tests prove first/repeated identity provisioning, two-user count for two identities (no orphan/duplicate user under concurrent requests), empty and populated affiliations, and no profile/email columns copied to User.
- Real local Auth integration created a unique test user using an in-memory `SUPABASE_TEST_SECRET_KEY`, signed in through the public password flow, called the actual Nest route, repeated and concurrently called `/v1/auth/me`, refreshed the session, and cleaned Auth and UniMate test rows.
- Web UI verified sign-up, authenticated `/v1/auth/me`, browser reload/session restore, successful Auth logout response, sign-out, and signed-out reload; the browser reported zero console errors and zero page errors.
- Existing iOS development client verified sign-up, API identity, SecureStore-backed session restoration after relaunch, sign-out, and signed-out relaunch. Existing Android development client verified sign-in, authenticated API identity, session restoration after relaunch, sign-out, and signed-out relaunch. Both used existing native builds; no native rebuild was run.
- Android's local Supabase/API defaults resolved through `10.0.2.2`; successful sign-in and `/v1/auth/me` confirmed host reachability. Metro was also bound to the emulator-reachable host during device verification.
- Direct npm registry results: `@supabase/supabase-js` 2.117.3 (stable v2), `jose` 6.2.12, `react-native-url-polyfill` 4.0.0, and test-only `@types/node` 24.19.1. No Supabase JS v3/next package is used.
- Supabase documentation MCP was unavailable at its configured endpoint; current official Supabase and versioned Expo documentation were fetched directly.
- No Prisma schema/migration changes were needed. No hosted Supabase project was linked or changed. Generated OpenAPI contains `/v1/auth/me`; no extra OpenAPI security scheme metadata was added because the current contract configuration does not provide a clearly simple contract-derived scheme.
- Synthetic runtime/test Auth users and their UniMate rows were removed. No access token, refresh token, password, publishable key value, secret key value, or database credential was committed. No native/EAS build, commit, or push occurred.

## Final targeted hardening

- Confirmed against the installed Supabase JS 2.117.3 declarations and current official `auth.signOut` documentation that the default scope is `global`; the ordinary mobile action now explicitly uses `scope: "local"`. Global logout remains a future explicit action. Auth provider teardown also clears the in-memory bearer-token accessor.
- The server verifier rejects non-loopback plaintext HTTP `SUPABASE_URL` values while permitting the observed local loopback gateway and HTTPS remote origins. Mobile API and Supabase URL resolution shares a pure transport policy: production requires HTTPS; Expo `__DEV__` allows HTTP only for loopback/private development hosts, including Android `10.0.2.2` and private LAN addresses. Default host mappings are unchanged.
- The main Expo TypeScript config now excludes Node-based tests and does not include Node globals or `allowImportingTsExtensions`; `tsconfig.test.json` scopes those settings to the Node test runner. No test framework was added.
- `/v1/auth/me` affiliation results now have a stable `universityId` ordering; no primary-affiliation or other product semantics were added.
- Focused tests and the full final verification passed, including the local Supabase refresh integration. No Phase 6 work, schema changes, hosted operations, native rebuilds, commits, or pushes were introduced.
