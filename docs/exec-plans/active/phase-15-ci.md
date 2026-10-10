# Phase 15 — Continuous Integration

**Status: ACTIVE.** Local implementation is complete; remote workflow
execution and merge protection have not been proved.

## Baseline

- Began from clean `development` at `09bc929`; Phase 14 completion and
  [`IOS_DEVICE_SETUP.md`](../../engineering/IOS_DEVICE_SETUP.md) are committed.
- `.github/workflows/` had no canonical workflow and the worktree was clean.
- Local toolchain: Node `24.14.0`, pnpm `10.33.0`, Supabase CLI `2.120.0`.
  The Supabase version is present in the committed Phase 10 evidence and
  matches the local CLI.

## Decisions

- One Ubuntu `24.04` job/check, `foundation` / `Foundation`, runs for PRs to
  `development`, pushes to `development`, and manual dispatch.
- Workflow uses exact Node and pnpm repository sources, Supabase CLI `2.120.0`,
  SHA-pinned official actions, read-only contents permission, and no secrets.
- Supabase startup output is captured. A repository helper reads structured
  local status, reuses existing loopback validation, masks privileged local
  values before exporting only required variables, and refuses unverified
  endpoints.
- CI generates Prisma Client, applies migrations with `pnpm db:migrate:deploy`
  on a fresh local database, then runs the canonical verifier with its safe
  JSON report. Chromium-only `pnpm smoke:web` is included in the same job and
  reuses the stack without uploading traces/videos; Playwright installs
  Chromium dependencies, and the smoke-only `lsof` dependency is installed
  explicitly rather than assumed present on Ubuntu.
- Production builds for all ten runtime workspaces with emitted TypeScript
  tests exclude tests/test-support from `dist/`; full typechecking and test
  execution remain in place through `.test-dist/`. Turbo declares the
  separate output.
- The report is the only uploaded artifact and has seven-day retention.

## Repository rules

Read-only GitHub inspection found `development` is the default branch, has no
branch protection, and the repository has no rulesets or prior Actions runs.
The proposed required status check is exactly `Foundation`. No remote rule has
been modified; do not claim merge blocking until the post-push follow-up.
For that follow-up, require `Foundation` for the normal PR path without
silently adding a pull-request-only policy, deployment environment, or native
check. Preserve the current direct-push policy unless repository owners
explicitly choose otherwise.

## Local evidence

- `pnpm install --frozen-lockfile` passed without lockfile changes.
- Focused tooling suite passed (62 tests); formatting and secret scanning
  passed.
- Production artifact invariant passed for all ten workspaces and confirmed
  19 required test-only output sentinels. Affected Turbo build, test-build,
  typecheck, and unit-test tasks passed.
- The tooling suite discovers all TypeScript-test workspaces that emit with
  `tsc` and asserts each remains covered by production/test artifact checks.
- `pnpm verify:changed` passed in 25.7 seconds after adding `.test-dist/` to
  the shared ESLint ignores; the first attempt exposed that generated tests
  were being linted as runtime JavaScript.
- The single final `pnpm verify` passed all 15 steps in 22.1 seconds.
- All standalone affected integrations passed: database, Auth, Storage proof,
  push, authorization, providers, worker, and observability.
- After loopback validation and explicit local-reset consent,
  `pnpm db:reset` applied all seven committed Prisma migrations from zero and
  ran the deterministic seed; database status was current afterward.
- `pnpm smoke:web` passed locally in 27.4 seconds and cleaned its synthetic
  Auth and UniMate identity fixture.
- Focused tooling suite: about 1.2 seconds. Cached affected build/typecheck
  tasks: about 7.3 seconds. Remote cold-run timings remain unknown.

## Retrospective

The first artifact audit was too narrow and missed five workspaces. Persisted
that lesson as a tooling invariant which discovers `tsc` workspaces with
TypeScript tests and requires their production/test outputs to be covered.
The largest remaining friction is the unavailable remote Ubuntu/Docker proof;
that cannot be fixed or validated locally and remains the explicit post-push
checkpoint.

## Remote acceptance pending

After the user commits and pushes:

1. confirm GitHub parses the workflow;
2. inspect a real Actions run and verify the `Foundation` job passes;
3. inspect the safe report artifact;
4. configure or verify the required `Foundation` status check on `development`;
5. only then move this plan to `docs/exec-plans/completed/`.

There is no remote PASS yet. Do not begin Phase 16.
