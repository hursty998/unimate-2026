# Phase 15 — Continuous Integration

**Status: Complete.** Local verification, final GitHub proof, cache reuse, and
the required `Foundation` check on `development` are verified.

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
- Initial correction ran `pnpm openapi:generate` before the canonical
  verifier. Final hardening below replaces this with a committed snapshot so
  CI's check can detect drift rather than compare a fresh regeneration.
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
- Final remote job duration was 5m39s. Major measured stages: local Supabase
  startup 1m43s, canonical verification 1m56s, Chromium install 22s, and
  browser smoke 41s.
- GitHub confirmed check-run name `Foundation`, provided by the `github-actions`
  app (ID 15368).

## Final hardening and cache review

- OpenAPI drift was not truly protected while CI generated the ignored
  comparison document immediately before checking it. The generated
  `docs/generated/openapi.json` is now tracked; CI compares against the
  committed snapshot and does not regenerate it.
- The successful cold job took 5m39s: Supabase startup 103s, canonical verify
  116.2s, Chromium install 22s, smoke 41.1s, dependency install 10s, and
  OpenAPI generation 9s. Removing pre-verification OpenAPI generation saves
  about 9s and makes drift detection meaningful.
- Local `.turbo/cache` was about 45 MB. At review time, two existing GitHub
  Actions caches occupied about 416 MB. The user selected GitHub's official
  cache over Vercel OIDC: PRs (including forks) can restore target-branch
  cache entries and new data is saved only after successful trusted
  `development` pushes. Vercel OIDC cache credentials would either have to be
  withheld from PRs (no PR speed-up) or exposed to untrusted PR code.
- Cache keys are unique per run and include OS/toolchain/lockfile/Turbo config;
  a stable restore prefix reuses earlier entries. Turbo task hashes validate
  artifacts. Database/provider integration lanes run outside Turbo and remain
  uncached. No OIDC permission, token, Vercel team variable, or Vercel policy
  was added.
- Restore/save failures are explicitly warned but non-fatal because the cache
  is an optimization and correctness remains independent of cache availability.
- Focused local proof: `pnpm openapi:generate` followed by the check passed
  before making the snapshot tracked; afterwards `pnpm openapi:check` passed
  without generation and 65 tooling tests passed. Remote cache behavior is
  demonstrated in the final runs below.
- Final `pnpm verify:changed` passed in 6.9 seconds and the one final local
  `pnpm verify` passed all 15 steps in 22.7 seconds. No smoke code changed, so
  local `pnpm smoke:web` was not repeated.

## Final remote hardening proof

- The direct push was rejected because `Foundation` was still expected for the
  new commit. No protection was bypassed. A validation branch was pushed and
  the complete workflow was manually run on the exact commit; it passed all
  15 verifier steps and Chromium smoke. PR #1 was then opened, passed
  `Foundation`, and merged normally to `development` as
  `091ec8850f4035b0c616af212b4c31c528f033dd`. The validation branch remains;
  no branch was deleted.
- PR run [38088604650](https://github.com/hursty998/unimate-2026/actions/runs/38088604650)
  passed in 4m38s. At that point there was no Turbo cache on the base branch,
  so restore correctly missed and PR cache save was skipped.
- The merged development push,
  [38088959366](https://github.com/hursty998/unimate-2026/actions/runs/38088959366),
  passed all checks and smoke in 6m14s. Its 161.8s verifier report passed all
  15 steps; successful trusted-push cache save wrote a 1,518,216-byte
  `.turbo/cache` archive.
- Warm run
  [38089409619](https://github.com/hursty998/unimate-2026/actions/runs/38089409619)
  restored the exact development cache entry. All verifier steps passed in
  25.5s; total workflow time was 3m26s. The API build used by browser smoke
  logged 8/9 Turbo task hits. The 161.8s-to-25.5s verifier reduction is 136.3s
  (about 84%); whole-job time fell 168s (about 45%) between the cold push and
  warm run. Both safe JSON reports were inspected.
- Final status check remains `Foundation` from `github-actions` app ID 15368.
  Branch protection still has no required reviews, no up-to-date requirement,
  and no push restrictions. Force-push/delete settings were not changed.

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
The largest recurring friction was implicit clean-checkout state: Prisma's
Turbo environment and the ignored OpenAPI document were available locally but
not represented as safe CI inputs. Task-scoped environment forwarding and a
committed OpenAPI snapshot make both invariants explicit. GitHub's remote
cache was measured with cold and warm Actions runs; local runs cannot prove
cache service behavior.

## Acceptance

The hardened workflow passed on `development`, the safe verifier artifacts
were inspected, warm cache restore was proved, and the required `Foundation`
status check remains enabled. Phase 15 is complete. Do not begin Phase 16.
