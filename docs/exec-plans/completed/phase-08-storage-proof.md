# Phase 8 - Storage proof

## Goal

Prove authenticated, policy-authorised, direct object upload and read across web,
iOS Simulator, and Android emulator without sending file bytes through NestJS.
This is a synthetic foundation feature, not a product media API.

## Decisions to preserve

- Reuse the Phase 7 `ObjectStorage` port and Supabase adapter. Extend the port
  only if current provider support and the completion lifecycle demonstrate a
  concrete verification need.
- Supabase's current Storage `list` API exposes file `metadata.size` and
  `metadata.mimetype`; `ObjectStorage.getObjectMetadata` uses an exact
  parent-path/name match and returns only provider-neutral content type/size.
- Generate object keys in the API under a restricted foundation namespace.
- Persist only provider-neutral identity and the minimum lifecycle/metadata
  needed to distinguish an issued upload from a verified completed object.
- Restrict User deletion while stored-object metadata exists, so a database
  cascade cannot orphan provider bytes; the owning feature deletes bytes first.
- Enforce proof-object ownership in the feature application service after the
  existing authenticated-principal-to-User resolution.
- Keep the synthetic proof API and ObjectStorage composition out of production;
  show its Foundation UI only in development after identity resolution. Proof
  storage credentials are required outside production and optional in production.
- Forward upload capability headers generically through the provider-neutral
  contract, validating header syntax and the proof content type without
  embedding provider-specific header names in application code.
- Keep upload/read capabilities temporary; client transfers go directly to
  private Storage.
- Restrict local signed-URL origin adaptation to the recognised development
  Supabase endpoint and reuse the existing platform URL resolver.
- Do not add a product media model, native dependency, hosted-provider change,
  or Phase 9 work.

## Evidence required

- Focused unit/contract/application tests cover authentication posture,
  server-generated identity, persistence, ownership, completion verification,
  capability output, cleanup, and local URL adaptation.
- A local integration round-trips synthetic bytes through the real API,
  PostgreSQL, and private Supabase Storage and cleans up its own records.
- The standalone storage-proof integration remains self-contained, while
  canonical full verification runs its prepared form; `verify:changed` remains
  free of local provider/database integration.
- Runtime proof records direct Storage upload/read and byte equality on web,
  iOS Simulator, and Android emulator.
- The forward Prisma migration replays from zero using the documented
  loopback-safe application reset; seeds remain idempotent and provider-owned
  schemas survive.
- Changed-code review, the UniMate retrospective, `verify:changed` where useful,
  one final `pnpm verify`, and `pnpm secrets:check` inform completion.

## Progress

- Start gate: clean `development` worktree at the Phase 7 hardening commit;
  configured `origin` points to `hursty998/unimate-2026`.
- Local PostgreSQL is reachable and existing Prisma migrations are current.
- Local Supabase Auth, REST, and Storage endpoints respond. The Supabase MCP
  documentation request returned an upstream 502; use official documentation
  and the supported local CLI as the documented fallback.
- Current Supabase Storage documentation confirms object-list file metadata
  includes size and MIME type; the minimal provider-neutral metadata operation
  and `PENDING` → `READY` record lifecycle are implemented.
- The private `foundation-storage-proof` bucket is limited to 1 MiB and
  `text/plain`. This CLI did not provision TOML-declared buckets on start, so
  the local integration now idempotently provisions the dedicated bucket
  through the supported Storage API without touching provider tables.
- The forward migration replays from zero through the loopback-protected
  application reset. The seed ran repeatedly, database integration passed,
  provider-owned `auth`/`storage` schemas survived, and the schema test proves
  deleting a User is restricted until StoredObject metadata is removed.
- The real local Auth → Nest → PostgreSQL → Storage → direct byte PUT/GET
  integration passes and cleans its own test users, rows, and objects.
- The hardening follow-up keeps proof routes and adapter wiring out of production,
  gates the Foundation UI to development, and preserves generic upload
  capability headers across the ObjectStorage boundary. Its production-route,
  configuration, header-contract, and UI-visibility tests pass.
- The committed Phase 8 migration was reviewed and deliberately left immutable.
  Its hand-written unqualified `ALTER TABLE "stored_objects"` is safe because
  the Prisma migration connection is validated and configured to use the
  `app` schema. No forward migration was needed because there is no database
  state change to make.
- After restoring the exact committed migration, the documented loopback-guarded
  app-schema-only reset replayed all four migrations successfully. The seed
  succeeded during reset and again on a second run; `pnpm db:check` confirmed
  schema validity and current migration status, and `pnpm db:test` passed.
- The standalone storage-proof command passes using the real local Auth, API,
  PostgreSQL, and private Storage chain. Full verification includes the prepared
  integration; changed verification remains local-integration-free.
- During hardening, `pnpm secrets:check` passed early. The first
  `verify:changed` attempt found formatting issues in two edited files; focused
  Prettier correction followed by one milestone rerun passed.
- Browser, iOS Simulator, and Android emulator storage flows pass. Browser
  resource entries show control requests at the API and transfer URLs at
  Storage; Android visibly confirms `10.0.2.2:55321` host mapping.
- Changed-code review completed. The retrospective added a focused oRPC/Nest
  error-mapping rule to `ARCHITECTURE.md` and native-versus-web Metro guidance
  to `apps/mobile/AGENTS.md`. The largest recurring friction was selecting a
  Metro server compatible with both native and web; the mobile guide now
  distinguishes the targets. The sequential formatting/lint fixes did not
  justify more verification tooling.
- Final verification: `pnpm verify:changed` and `pnpm secrets:check` passed.
  The final `pnpm verify` passed. It was invoked twice overall: the first
  attempt stopped at the secret check because the touched API example contained
  a credential-bearing database URL; that example now uses a blank placeholder.
- Agent performance: approximately 8 hours 19 minutes elapsed. `verify:changed`
  was invoked seven times while fixing formatting/lint findings (two passes);
  no full verification was repeated after its passing run. The real local
  integration needed corrections for the Storage bucket response shape,
  Auth admin response parsing, and oRPC error mapping before passing.
- No Phase 9, product-media model, hosted Supabase change, native/EAS build,
  commit, or push was made.
- Notable retries: the Supabase docs MCP returned 502; the Prisma reset guard
  required explicit user consent; the first local integration attempts exposed
  bucket-response/schema assumptions and an ORPC error-mapping issue, all
  corrected before the passing end-to-end run.
