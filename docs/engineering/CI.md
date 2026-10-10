# Continuous integration

## Purpose

GitHub Actions reproduces the canonical local foundation gate from a clean
environment. It prepares local infrastructure, then runs the same verifier
used by developers rather than defining a separate lint/test pipeline.

## Triggers and required check

The `CI` workflow runs for pull requests targeting `development`, pushes to
`development`, and manual dispatch. Its single mandatory job is named
`Foundation`; this is the exact status check intended for the later merge
gate.

Initial inspection found no branch protection or rulesets on `development`.
After the successful run, branch protection was configured and verified with
the `Foundation` status check from the GitHub Actions app (ID 15368). Up-to-date
branch checking is disabled; administrator enforcement is enabled. No PR
review requirement or push restrictions were added; force-pushes and branch
deletion remain enabled. Repository rulesets remain unused.

The first real run, commit `f3c582e` ([Actions run 38080850708](https://github.com/hursty998/unimate-2026/actions/runs/38080850708)),
failed because Turbo strict mode did not forward `DIRECT_URL` to Prisma's
`generate` task. The task-scoped pass-through fix is in place.

The next run, commit `0a1cd74` ([Actions run 38081690564](https://github.com/hursty998/unimate-2026/actions/runs/38081690564)),
confirmed the Turbo fix but exposed the OpenAPI input missing on clean
runners. The initial correction generated it before verification; final
hardening instead commits the snapshot and removes that self-fulfilling step.

The final run, commit `5306caf` ([Actions run 38082442800](https://github.com/hursty998/unimate-2026/actions/runs/38082442800)),
passed the complete foundation verifier and Chromium smoke. Its safe report
artifact was inspected. The `Foundation` check is now required on
`development`.

That cold run took 5m39s total: Supabase startup 103s, canonical verification
116.2s, Chromium install 22s, and browser smoke 41.1s; dependency install was
10s and OpenAPI generation 9s. The ignored OpenAPI regeneration has since been
removed by committing the generated snapshot. The local `.turbo/cache` was
about 45 MB at review time. GitHub Actions caching is intended to reuse
build/typecheck/unit-test outputs on future PR runs; measure actual restore
hits and savings in the next successful run.

## Toolchain and sequence

The job uses GitHub-hosted `ubuntu-24.04`, Node from `.node-version`, pnpm from
the root `packageManager` field, and Supabase CLI `2.120.0`, the committed
local baseline. Actions are pinned to full commit SHAs with their upstream
release tags next to each `uses:` entry; Dependabot checks GitHub Actions
monthly.

The workflow caches only `.turbo/cache` with the official SHA-pinned
`actions/cache` restore/save actions. The key includes OS, Node/package
toolchain, lockfile, Turbo config, and a unique run identifier; the fallback
prefix permits reuse across commits while Turbo's own task hashes continue to
decide correctness. Pull requests can restore the target branch cache, but
cache writes are saved only after a successful push to `development`. Turbo's
task hashes remain authoritative; root DB/provider integration lanes run
outside Turbo and are never cached. Cache restore/save failures become explicit
warnings and do not fail the quality gate. No Vercel token, OIDC permission,
or repository secret is exposed to PR code; GitHub enforces read-only cache
access to base-branch entries for fork PRs.
Vercel OIDC was not selected because a cache access token in a PR job would be
available to untrusted PR-controlled scripts; branch-scoped OIDC would deny
that token to PRs and therefore would not accelerate the required PR run.

The job:

1. checks out without persisted write credentials, restores the
   toolchain-scoped Turbo cache, and installs with
   `pnpm install --frozen-lockfile`;
2. starts only the repository-configured local Supabase stack;
3. reads `supabase status -o json`, validates matching loopback API and
   PostgreSQL endpoints using the existing local smoke/reset guards, masks
   privileged values, and exports only required local environment variables;
4. generates Prisma Client and applies committed Prisma migrations to the
   fresh database through `pnpm db:migrate:deploy`;
5. runs the canonical `pnpm verify` lane with a safe machine-readable report:
   `node scripts/verify.mjs --report-json .ci-artifacts/verify.json`;
6. installs Chromium and its Linux dependencies with Playwright, installs
   `lsof` for the smoke harness's process-ownership checks, and runs
   `pnpm smoke:web` against that same local stack;
7. saves `.turbo/cache` only after a successful development push.

The smoke remains separate from local `pnpm verify`. It owns its API and
browser processes and uses only synthetic local credentials. The workflow
does not upload Playwright screenshots, traces, or videos.

## Local reproduction and artifacts

Reproduce foundation failures with `pnpm verify`; reproduce the browser flow
with `pnpm smoke:web` after configuring local `.env` files and starting local
Supabase. OpenAPI drift is checked against the committed generated snapshot;
run `pnpm openapi:generate` only when intentionally updating that contract
artifact. Destructive database commands remain guarded by the existing
loopback endpoint checks.

The workflow uploads only the verifier's safe JSON report, including when
verification fails, for seven days. The report contains step status and
durations, not child output. Raw verifier logs and Playwright artifacts are
not uploaded because they can contain environment-specific details or
synthetic browser input.

## Production and test artifacts

`tsconfig.json` remains the complete source typecheck configuration, including
tests. All ten runtime workspaces with emitted TypeScript tests use
`tsconfig.build.json` for production-only `dist/` output and
`tsconfig.test.json` for test compilation into ignored `.test-dist/`: API,
worker, auth, authorization, database, jobs, notifications, observability,
queue, and storage.
Prepared integration commands use the test-only output. Turbo tracks both
build outputs, and the canonical full verifier inspects actual production and
test-only artifacts after building. Tooling also discovers TypeScript test
workspaces and requires each one to remain in the artifact inventory.
Turbo's `generate` task passes `DIRECT_URL` through strict task-environment
filtering because Prisma config validates it during client generation. It is
pass-through rather than a cache-hashed input: generation does not connect to
or vary by database contents or credentials.

## Security and scope

Pull-request verification uses `pull_request`, not `pull_request_target`, with
only `contents: read`. It requires no repository secrets and has no access to
hosted Supabase, EAS, Apple, Sentry, or PostHog credentials. The local
Supabase service key is masked before it is exported and is used only by the
ephemeral runner. There are no deploy, publish, or remote migration steps.

Deployments/CD, EAS, production infrastructure, native device tests, and agent
evaluations remain deferred. Native smoke is a deliberate local/device
workflow, not part of this Linux merge gate.
