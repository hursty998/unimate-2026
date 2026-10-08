# UniMate Agent Guide

This is the entry map for coding agents. Keep it short; use canonical
engineering documents, nested guidance, and focused Skills for detail.

## Product and architecture

UniMate is a university community application. Keep product code specific to
UniMate and make infrastructure seams replaceable only where there is a
realistic reason.

The intended flow is:

```text
Expo -> shared oRPC/Zod contracts -> NestJS API -> application logic -> Prisma -> PostgreSQL
```

## Always-on boundaries

- Mobile never imports Prisma/database internals or queries UniMate domain tables
  directly through Supabase.
- API changes begin with `packages/contracts`; transport handlers stay thin.
- Every API operation declares an access posture. Business authorization is
  enforced server-side, not only in UI code.
- Feature/domain code does not import provider SDKs; keep them in intended
  adapter/bootstrap locations.
- Durable business relationships belong in relational PostgreSQL structures.
  Use the transactional outbox for consequential asynchronous work where
  applicable.
- Database schema changes use committed Prisma migrations. Never use
  `prisma db push` as the production schema workflow.
- Do not edit generated files or bypass an architecture boundary for convenience.
- Do not create generic frameworks or speculative product features.

## Sources of truth

Use:

- API contracts: `packages/contracts/`
- Database and Prisma: `packages/database/`
- Authentication: `packages/auth/`
- Authorization catalogue: `packages/authorization/`
- Provider packages: `packages/storage/`, `packages/queue/`,
  `packages/notifications/`, `packages/observability/`
- Shared configuration: `packages/config/`
- Architecture and principles: [`docs/engineering/`](./docs/engineering/)
- Database rules: [`DATABASE.md`](./docs/engineering/DATABASE.md)
- Authentication rules: [`AUTHENTICATION.md`](./docs/engineering/AUTHENTICATION.md)
- Authorization rules: [`AUTHORIZATION.md`](./docs/engineering/AUTHORIZATION.md)
- Native runtime inventory: [`NATIVE_RUNTIME.md`](./docs/engineering/NATIVE_RUNTIME.md)
- Active/completed plans: `docs/exec-plans/active/` and
  `docs/exec-plans/completed/`

Read relevant nested `AGENTS.md` files and engineering docs before changing a
subsystem. For cross-cutting or architectural work, read
[`ARCHITECTURE.md`](./docs/engineering/ARCHITECTURE.md) and
[`ENGINEERING_PRINCIPLES.md`](./docs/engineering/ENGINEERING_PRINCIPLES.md);
also read [`FOUNDATION_IMPLEMENTATION_PLAN.md`](./docs/engineering/FOUNDATION_IMPLEMENTATION_PLAN.md)
for foundation work.

## Working loop

- Make an execution plan for substantial multi-step work; keep small changes
  focused.
- After adding a workspace package, dependency, or dependency edge, install
  before building or testing it.
- For Prisma model changes, check physical-schema assertions and snapshots; use
  forward migrations and the documented loopback-safe reset workflow when
  migration-from-zero validation is required.
- Start with focused checks. Use `pnpm verify:changed` for fast affected
  feedback and `pnpm verify` once for complete final validation. Use
  `pnpm verify:verbose` when live child output is useful.
- `pnpm db:test`, `pnpm auth:test`, and `pnpm authorization:test` are
  self-contained. Their `*:prepared` forms are internal to full verification.
- If verification fails, use its bounded failure summary; read the full
  temporary log only when needed.
- Review the diff, remove accidental/dead code, and report checks actually run.

For web UI changes, use the VS Code integrated browser for exploratory review
and committed Playwright tests for durable flows. For native UI changes, use
`agent-device` with the iOS Simulator or Android emulator and inspect the
running app. See the mobile guidance and
[`NATIVE_RUNTIME.md`](./docs/engineering/NATIVE_RUNTIME.md).

## Agent workflow and retrospective

See the concise [Agent workflow](./docs/engineering/AGENT_WORKFLOW.md) for the
normal coding loop, instruction hygiene, Skills, and hook decisions.

For substantial implementation, refactor, or debugging work, after
implementation and verification and before handoff, run the
[UniMate retrospective Skill](./.agents/skills/unimate-retrospective/SKILL.md).
Persist changes only when a lesson passes its durability gate. Skip trivial or
documentation-only edits where no meaningful coding session occurred.

## Completion

Before handoff, verify relevant architecture boundaries, update directly
affected documentation, inspect the diff, and state validation results and
anything that could not be verified. Do not silently leave known failures.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
