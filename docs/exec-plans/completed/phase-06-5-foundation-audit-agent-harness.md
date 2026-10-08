# Phase 6.5 — Foundation Audit + Agent Harness

**Status:** Complete  
**Started:** 2026-10-08

## Purpose

Close small Phase 1–6 acceptance gaps and improve repository legibility and
verification without starting Phase 7 provider work or product-domain
implementation.

## Starting state

- Physical checkout: `/Users/henry/Documents/Projects/UniMates-2026/unimate-2026`.
- Branch: `development`; origin:
  `https://github.com/hursty998/unimate-2026.git`; worktree clean.
- HEAD `3de4553` contains Phase 6 authorization/access-posture hardening; the
  preceding Phase 6 implementation is `ac97d03`.
- Local Supabase containers are healthy, PostgreSQL at `127.0.0.1:55322`
  accepts connections, and Prisma 7.10.0 reports both existing migrations
  applied.

## Initial audit findings

- Phase 6 documents the resource-policy boundary but has no executable proof
  that a feature-local policy can deny after coarse capability access succeeds.
- Runtime authorization fails closed on Role/RoleAssignment scope mismatch, but
  the current relational schema permits the inconsistent row.
- The root README still describes a pre-framework repository; the Phase 0
  environment report is accurate history but is not marked historical.
- Architecture and Phase 7 planning still name an `IdentityProvider` and
  `SupabaseIdentityProvider` that could prompt a duplicate of Phase 5's existing
  token-verification, identity, and mobile Auth seams.
- The verification runner buffers each complete child output before writing a
  log, despite already imposing output-tail limits.
- Root `AGENTS.md` is 254 lines and repeats detail held in canonical engineering
  documents. The installed Skills collection is vendor-installed and needs a
  scoped reference/trigger audit before the planned UniMate-owned Skill is added.

## Decisions and work record

| Area                     | Decision / evidence                                                                                                                                                                                                                                                                                                                                                                           | Status                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Phase 1–6 audit          | Revisited each completed plan, source-of-truth docs, architecture restrictions, and tests. No blocking gaps remain.                                                                                                                                                                                                                                                                           | Pass                                    |
| Resource-policy proof    | Added `apps/api/src/test-support/owned-draft-resource-service.ts` and a real-PostgreSQL integration test. It proves a persisted coarse grant succeeds, a separate owner/lifecycle policy denies, and the mutation callback is not reached. `pnpm authorization:test` passes.                                                                                                                  | Implemented; final verification pending |
| Role scope integrity     | Prisma 7.10 validates the composite relation. Added `Role(id, scopeKind)` uniqueness and `RoleAssignment(roleId, scopeKind)` composite reference; retained the runtime Role-scope filter, the `roleId` index for FK cascade/role lookup, and the user/scope index for grant resolution.                                                                                                       | Implemented                             |
| Migration safety         | Created and applied forward migration `20261008193028_role_assignment_scope_integrity`; reviewed SQL adds the required unique index and composite FK only. Previous migrations were not edited. Explicitly authorized loopback reset replayed all three migrations; the second seed was idempotent, grants remained absent, provider schemas survived, and migration history stayed in `app`. | Pass                                    |
| README / Phase 0 report  | Replaced the Phase 1-era README with the current foundation map and added a historical banner without changing Phase 0 facts or the outstanding secret-related action.                                                                                                                                                                                                                        | Implemented                             |
| Phase 7 identity seam    | Architecture and foundation plan now treat Phase 5's `AccessTokenVerifier`, Supabase JWT adapter, provider-neutral identity/User/AuthIdentity, and mobile Auth adapter as the existing seam.                                                                                                                                                                                                  | Implemented                             |
| Retrospective model      | Every substantial coding session reviews friction; persist only lessons passing the recurrence/durability gate. Zero changes is valid; prefer mechanical enforcement.                                                                                                                                                                                                                         | Implemented                             |
| Agent guidance           | Reduced root guidance from 254 lines to 111, added the short retrospective trigger and workflow pointer, and preserved hard boundaries and managed Turbo guidance. Added one focused migration-prompt note to the database-local guide.                                                                                                                                                       | Implemented                             |
| Retrospective Skill      | Created `.agents/skills/unimate-retrospective/SKILL.md` with narrow triggering, evidence review, classification, durability gate, persistence hierarchy, verification, and concise reporting. `quick_validate.py` passes; do not invoke recursively here.                                                                                                                                     | Implemented                             |
| Vendor Skills            | `.agents/skills` contains 18 vendor Skills recorded in `skills-lock.json`. A targeted `skills update prisma-orm-setup` reports all project Skills current and made no changes. One optional `prisma-mongodb-upgrade` relative companion is absent; illustrative `skill-creator` links are examples, not missing files. No vendor content was forked.                                          | Audited; optional companion deferred    |
| Guidance integrity check | Deferred a permanent Markdown-link checker because the available approach would require maintaining a partial parser. Validate owned links when editing and validate the custom Skill with the creator's validator.                                                                                                                                                                           | Decided: defer                          |
| Verification runner      | Child stdout/stderr now stream to temporary log files; only the bounded rolling tail is retained in memory. Tooling tests cover large output, retained full log, quiet success, verbose output, exit code, tail bounds, and stop-on-failure.                                                                                                                                                  | Pass                                    |
| Expo compatibility       | The installed CLI fetches remote SDK recommendations by default. `EXPO_OFFLINE=1` uses bundled metadata but warns validation is unreliable; keep this out of `pnpm verify` and document the mobile workflow.                                                                                                                                                                                  | Decided: omit from canonical verify     |
| Future harness           | Foundation plan now records existing verify scripts, failure tails, architecture checks, AGENTS, and retrospective Skill. Phase 12 extends them; Phase 15 records test-code bundle separation before deployment.                                                                                                                                                                              | Implemented                             |
| Repository legibility    | Keep current package APIs and feature boundaries; do not refactor the large authorization integration fixture solely for size. Preserve “specific product, generic seams.”                                                                                                                                                                                                                    | Audited; no unrelated refactor          |
| Hooks                    | Add no semantic self-modifying hook. Consider hooks later only for deterministic lifecycle/security automation with reliable environment support.                                                                                                                                                                                                                                             | Decided: defer                          |
| Scope                    | No Phase 7 provider, product-domain, hosted, native, or EAS implementation. No commit or push.                                                                                                                                                                                                                                                                                                | In force                                |

## Post-change Phase 1–6 audit

| Phase                          | Result                  | Evidence                                                                                                                                                                                                                       |
| ------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 — Monorepo/tooling           | PASS                    | Frozen install and full verification pass; workspace, Turbo, strict TypeScript, and architecture lint remain intact.                                                                                                           |
| 2 — Expo/native envelope       | PASS                    | SDK 57 and the existing native envelope remain unchanged. Prior completed-plan web/iOS/Android evidence stands; this task made no runtime/native changes or builds.                                                            |
| 3 — API/contracts              | PASS                    | Contracts-first NestJS/Fastify/oRPC/Zod implementation, access-posture tests, OpenAPI generation, and full verification pass.                                                                                                  |
| 4 — PostgreSQL/Prisma          | PASS WITH DEFERRED ITEM | Prisma 7.10 validates; three migrations replay from zero; `pnpm db:test` proves app schema inventory, migration-history schema, and `auth`/`storage` survival. Production test-code artifact separation remains Phase 15 work. |
| 5 — Authentication/identity    | PASS                    | `pnpm auth:test` passes after reset; local asymmetric-JWKS identity mapping remains intact. Phase 7 planning now reuses this seam.                                                                                             |
| 6 — Authorization/capabilities | PASS                    | API unit/integration checks pass; resource-policy denial is tested after a real coarse grant; the DB composite FK and runtime scope check both enforce the Role scope invariant.                                               |

No known blocker before Phase 7 remains. Intentionally deferred items are the
unimplemented Phase 7 provider seams, real product resource policies/models,
production bundle separation, agent evaluations until representative tasks
exist, semantic hooks, and a general Markdown-reference checker that would
otherwise require maintaining a partial parser. The optional missing vendor
Prisma MongoDB companion is unrelated to this PostgreSQL project.

## Retrospective findings

The migration command documentation used an extra argument separator that
survived the nested pnpm script; `DATABASE.md` now shows the verified syntax.
Prisma's create-only uniqueness confirmation also requires a TTY in this
environment; the focused database guide now requires reviewing that warning
instead of bypassing it. These are recurring database-workflow improvements.
The Python executable mismatch during Skill scaffolding was transient and did
not warrant a permanent rule.

## Validation record

- `pnpm install --frozen-lockfile`: PASS.
- Prisma format, validate, generate, and migration status: PASS; all three
  migrations current after the reset.
- `pnpm db:reset`: PASS after explicit user consent; migrations replayed from
  zero and the normal idempotent seed ran.
- Second `pnpm db:seed`: PASS. Post-seed counts were one fixture University,
  two Users, two fixture AuthIdentities, one affiliation, zero outbox messages,
  zero Roles/RoleCapabilities/RoleAssignments/CapabilityAssignments;
  `_prisma_migrations` is under `app`, and Supabase `auth`/`storage` schemas
  survived.
- `pnpm db:test`, `pnpm auth:test`, and `pnpm authorization:test`: PASS.
- API unit/access-posture tests and tooling tests: PASS.
- Retrospective Skill structure/UI metadata and owned relative Markdown links:
  PASS; 17 owned Markdown files and 45 relative links checked without failures.
- Expo SDK 57 dependency check passes against the current install. The default
  check uses remote Expo metadata; offline mode warns that validation is
  unreliable, so it is documented outside canonical verification.
- `pnpm verify:changed`: PASS.
- `pnpm verify`: PASS, all eight full verification steps.
- `git diff --check`, `pnpm git-diff`, and the generated-report
  credential-shaped scan: PASS before the move; regenerate and rescan the final
  report after moving this plan to completed.

All applicable acceptance criteria pass. No blocking Phase 1–6 gap remains
before Phase 7.
