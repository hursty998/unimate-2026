# Phase 15 — Continuous Integration

**Status: Complete.** Local implementation, remote GitHub Actions proof, and
the required status check on `development` are verified.

## First remote run follow-up

- Commit `f3c582e` (`38080850708`) parsed and started the workflow. The safe
  verifier report was uploaded and inspected.
- Remote steps `format`, `tooling tests`, and `secret check` passed. The Turbo
  task failed because strict task environment filtering did not pass
  `DIRECT_URL` to `@unimate/database#generate`; Prisma config requires the
  variable even for client generation. Remaining verify steps and web smoke
  were not run.
- Fix: declare task-scoped `DIRECT_URL` passthrough for Turbo `generate`.
  No hosted credential or database content is included in cache hashing.
- Local proof after the fix: 63 tooling tests passed; a synthetic invalid
  `DIRECT_URL` reached Prisma validation through Turbo and was rejected before
  generation; `pnpm verify:changed` passed in 13.4 seconds; final
  `pnpm verify` passed all 15 steps in 22.7 seconds.
- Commit `0a1cd74` contains this fix; its remote run confirmed the Turbo
  generation, lint/typecheck/build/test, and artifact stages now pass.

## Second remote run follow-up

- Commit `0a1cd74` parsed and ran successfully through setup, Prisma
  generation, migrations, Turbo lint/typecheck/build/tests, and production
  artifact checks.
- The OpenAPI check failed because `docs/generated/openapi.json` is
  intentionally ignored and absent from a clean checkout. The safe report was
  uploaded and inspected; database and provider lanes plus browser smoke were
  not run after this failure.
- Fix: run the existing `pnpm openapi:generate` before the canonical verifier
  in CI. The verifier itself retains its non-mutating OpenAPI check.
- Local proof: `pnpm openapi:generate && pnpm openapi:check:prepared` passed;
  64 focused tooling tests passed; `pnpm verify:changed` passed in 5.9
  seconds; final `pnpm verify` passed all 15 steps in 23.1 seconds.

## Final remote proof

- Commit `5306caf` passed the GitHub Actions `Foundation` job in
  [run 38082442800](https://github.com/hursty998/unimate-2026/actions/runs/38082442800).
- The canonical verifier passed all 15 steps in 116.2 seconds. The safe JSON
  report artifact was downloaded and inspected; every step passed.
- Chromium browser smoke passed its single end-to-end test in 33.7 seconds
  (41.1 seconds including harness cleanup). The synthetic Auth and UniMate
  identity fixture was cleaned. No browser traces or videos were uploaded.
- GitHub confirmed check-run name `Foundation`, provided by the `github-actions`
  app (ID 15368).

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

`development` is the default branch. Initial inspection found no branch
protection or rulesets. After the successful run, branch protection was
configured and read back with exactly the `Foundation` check from
`github-actions` app ID 15368, strict up-to-date checking disabled, and
administrator enforcement enabled. No pull-request review requirement,
push restrictions, deployment environment, or native checks were added.
Force-pushes and branch deletion remain enabled, matching the prior
permissions. The repository has no rulesets.

## Local evidence

- `pnpm install --frozen-lockfile` passed without lockfile changes.
- Focused tooling suite passed (64 tests); formatting and secret scanning
  passed.
- Production artifact invariant passed for all ten workspaces and confirmed
  19 required test-only output sentinels. Affected Turbo build, test-build,
  typecheck, and unit-test tasks passed.
- The tooling suite discovers all TypeScript-test workspaces that emit with
  `tsc` and asserts each remains covered by production/test artifact checks.
- `pnpm verify:changed` passed in 25.7 seconds after adding `.test-dist/` to
  the shared ESLint ignores; the first attempt exposed that generated tests
  were being linted as runtime JavaScript.
- Final local `pnpm verify` after the CI fixes passed all 15 steps in
  23.1 seconds.
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
The largest recurring friction was implicit clean-checkout state: the ignored
OpenAPI document and Turbo-filtered Prisma environment were available locally
but missing from task setup in CI. Explicit bootstrap steps and tooling
invariants now capture both requirements.

## Acceptance

GitHub parsed the workflow, the real `Foundation` job and browser smoke passed,
the safe report was inspected, and the `Foundation` required status check is
active on `development`. Phase 15 is complete. Do not begin Phase 16 as part of
this task.
