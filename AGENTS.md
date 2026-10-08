# UniMate Agent Guide

This file is the entry point for coding agents working in this repository.

Keep this file short. It is a map to deeper sources of truth, not a complete engineering manual.

## Read first

Before making architectural or cross-cutting changes, read:

- `docs/engineering/ARCHITECTURE.md`
- `docs/engineering/ENGINEERING_PRINCIPLES.md`

For substantial foundation work, also read:

- `docs/engineering/FOUNDATION_IMPLEMENTATION_PLAN.md`

Read only additional documentation relevant to the task. Do not load the whole repository documentation into context without reason.

## Product

This repository is for UniMate.

The application architecture is product-specific, but infrastructure seams should remain replaceable where there is a realistic reason to change provider.

Do not prematurely generalise UniMate into a generic framework.

## High-level architecture

The intended dependency flow is:

Expo
→ shared oRPC/Zod contracts
→ NestJS API
→ application/domain logic
→ Prisma
→ PostgreSQL

Provider-backed infrastructure includes:

- authentication
- object storage
- background queueing
- push notifications
- observability

Feature/domain code must depend on provider-neutral interfaces rather than provider SDKs.

## Hard boundaries

These rules are architectural invariants.

- Mobile code must never import Prisma or database internals.
- Mobile code must not query UniMate domain tables directly through Supabase.
- API changes begin with the shared contract.
- Feature/domain code must not directly depend on Supabase, Expo Push, or another provider SDK.
- Provider SDK imports belong only in provider adapter/bootstrap locations explicitly intended for them.
- Expo Router route files contain routing/composition, not business logic.
- NestJS controllers/transport handlers remain thin.
- Business authorisation must not live only in the UI.
- Durable business relationships belong in relational PostgreSQL structures, not arbitrary JSON.
- Background work goes through the queue abstraction.
- Consequential database writes and resulting asynchronous work use the transactional outbox pattern where applicable.
- Generated files are not edited manually.
- Database schema changes use committed Prisma migrations.
- Production schema changes must never rely on `prisma db push`.
- New API routes must have an explicit access posture.
- Do not bypass architecture simply because a shortcut is easier.

## Source-of-truth locations

Use:

- API contracts: `packages/contracts`
- Database schema and Prisma: `packages/database`
- Database architecture and workflow: `docs/engineering/DATABASE.md` and `packages/database/AGENTS.md`
- Authentication infrastructure: `packages/auth`
- Authentication architecture and lifecycle: `docs/engineering/AUTHENTICATION.md`
- Authorisation catalogue: `packages/authorization`
- Authorisation architecture and enforcement: `docs/engineering/AUTHORIZATION.md`
- Object storage: `packages/storage`
- Queue infrastructure: `packages/queue`
- Push notifications: `packages/notifications`
- Observability: `packages/observability`
- Shared configuration: `packages/config`
- Engineering architecture: `docs/engineering/ARCHITECTURE.md`
- Engineering rules: `docs/engineering/ENGINEERING_PRINCIPLES.md`
- Active implementation plans: `docs/exec-plans/active/`
- Completed implementation plans: `docs/exec-plans/completed/`

If the repository structure changes deliberately, update these references.

## Package design

Prefer vertical business modules over large technical-layer folders.

For example, prefer:

`modules/events/...`

over global folders such as:

`controllers/`
`services/`
`repositories/`

Cross-feature imports should use explicit public APIs rather than reaching into another feature's internals.

Do not create generic `utils.ts`, `helpers.ts`, or `common.ts` dumping grounds.

## API contracts

The canonical internal API contract uses:

- oRPC
- Zod

Contracts are handwritten semantic source code.

OpenAPI and similar artefacts are derived outputs.

When changing an API:

1. update the contract;
2. typecheck;
3. update server implementation;
4. update consumers;
5. update tests;
6. regenerate derived documentation where configured.

## Database

PostgreSQL and Prisma are intentional long-term architecture choices.

The PostgreSQL hosting provider may change.

Do not build an artificial abstraction intended to make PostgreSQL or Prisma replaceable.

Design schemas for real relational querying and integrity.

## Authentication and authorisation

Authentication answers:

"Who is this?"

Authorisation answers:

"Can this actor perform this action on this resource in this context?"

Do not conflate authentication, University verification, Society membership, role assignment, or permissions.

Capabilities implemented by the application are code-defined.

Human-friendly roles may eventually be data-defined bundles of capabilities.

Resource-specific policy checks belong in the authorisation/application layer.

Protected API access is deny-by-default.

## Validation

For code changes, run the smallest relevant verification loop first.

When implemented, prefer:

- `pnpm verify:changed` for fast affected checks;
- `pnpm verify` for full repository verification.

Do not claim a check passed unless it was actually run.

Fix failures introduced by your change before finishing.

## Coding-agent verification loop

- After adding a workspace package, dependency, or dependency edge, run `pnpm install` before building or testing it.
- Prefer focused checks during implementation; run `pnpm verify:changed` for fast affected checks and `pnpm verify` once for full validation. Use `pnpm verify:verbose` when live task output is needed.
- If verification fails, use its final step/log summary; inspect the full temporary log only when the bounded tail is insufficient, fix and rerun that step, then rerun full verification.
- After Prisma model/table changes, search for physical schema inventory assertions and snapshots before full verification.
- Before broad patches against files edited earlier in a task, reread the relevant section and keep edits focused.
- Follow repository guidance and installed skills first; consult broad vendor documentation only for a concrete unresolved version or failure question.
- Standalone `pnpm db:test`, `pnpm auth:test`, and `pnpm authorization:test` prepare their prerequisites. Their `*:prepared` counterparts are internal to full verification and assume generation/build already passed.

## UI verification

For web-facing UI changes:

- use the VS Code integrated browser tools when available for exploratory verification;
- use committed Playwright tests for durable browser E2E coverage.

For native mobile UI changes:

- use `agent-device` against the local iOS Simulator or Android emulator when available;
- inspect the running UI rather than relying only on code reasoning;
- capture evidence for important flows when practical.

If browser/device tooling is unavailable, state that clearly rather than claiming visual verification.

## Dependencies

Do not add a dependency before checking whether the repository already provides the required capability.

Direct production dependencies should be deliberately versioned and committed through the lockfile.

Use stable releases unless an unstable dependency is explicitly approved.

For Expo SDK packages, use Expo-compatible installation commands rather than guessing versions.

Adding or changing a native dependency may require a new development build.
For Expo native dependencies, native permissions, development-client rebuild decisions, and runtime fingerprints, consult `docs/engineering/NATIVE_RUNTIME.md`.

## Documentation

If an architectural decision changes, update the relevant documentation in the same change.

Do not duplicate the same rule across many documents unnecessarily.

Prefer links to the canonical source.

## Plans

For a substantial multi-step task:

- create or update an execution plan under `docs/exec-plans/active/`;
- record important decisions or deviations;
- move the plan to `docs/exec-plans/completed/` when complete.

Small, obvious changes do not require a formal execution plan.

## Completion standard

Before finishing:

- inspect the diff;
- remove accidental/dead code;
- run relevant verification;
- verify architecture boundaries;
- update documentation when required;
- report what was changed;
- report what was tested;
- report anything that could not be verified.

Do not silently leave known failures behind.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
