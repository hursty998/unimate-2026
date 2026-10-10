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

As inspected before the workflow is pushed, `development` has no branch
protection and the repository has no rulesets. GitHub had no workflow runs for
this repository at that point. No remote setting has been changed, and
`Foundation` is not yet a required status check. Remote workflow execution and
the merge rule remain pending until this workflow is committed, pushed, and
passes on GitHub. The follow-up should require `Foundation` for the normal PR
path; do not change the current direct-push policy or add unrelated environment
or native checks without an owner decision.

The first real run, commit `f3c582e` ([Actions run 38080850708](https://github.com/hursty998/unimate-2026/actions/runs/38080850708)),
confirmed GitHub parsed and started the workflow but failed during canonical
verification: Turbo strict mode did not forward `DIRECT_URL` to Prisma's
`generate` task. The uploaded safe report was inspected. The task-scoped
pass-through fix is local and awaits a new pushed run; browser smoke has not
yet run on GitHub.

The next run, commit `0a1cd74` ([Actions run 38081690564](https://github.com/hursty998/unimate-2026/actions/runs/38081690564)),
confirmed that fix: Prisma generation, migrations, Turbo quality tasks, and
the artifact invariant passed. OpenAPI checking then failed because its
ignored comparison document is absent on a clean runner. CI now generates that
input before invoking the unchanged canonical verifier; this rerun and the
browser smoke remain pending.

## Toolchain and sequence

The job uses GitHub-hosted `ubuntu-24.04`, Node from `.node-version`, pnpm from
the root `packageManager` field, and Supabase CLI `2.120.0`, the committed
local baseline. Actions are pinned to full commit SHAs with their upstream
release tags next to each `uses:` entry; Dependabot checks GitHub Actions
monthly.

The job:

1. checks out without persisted write credentials and installs with
   `pnpm install --frozen-lockfile`;
2. starts only the repository-configured local Supabase stack;
3. reads `supabase status -o json`, validates matching loopback API and
   PostgreSQL endpoints using the existing local smoke/reset guards, masks
   privileged values, and exports only required local environment variables;
4. generates Prisma Client and applies committed Prisma migrations to the
   fresh database through `pnpm db:migrate:deploy`;
5. generates the ignored OpenAPI verification input with
   `pnpm openapi:generate` because it is intentionally absent from a clean
   checkout;
6. runs the canonical `pnpm verify` lane with a safe machine-readable report:
   `node scripts/verify.mjs --report-json .ci-artifacts/verify.json`;
7. installs Chromium and its Linux dependencies with Playwright, installs
   `lsof` for the smoke harness's process-ownership checks, and runs
   `pnpm smoke:web` against that same local stack.

The smoke remains separate from local `pnpm verify`. It owns its API and
browser processes and uses only synthetic local credentials. The workflow
does not upload Playwright screenshots, traces, or videos.

## Local reproduction and artifacts

Reproduce foundation failures with `pnpm verify`; reproduce the browser flow
with `pnpm smoke:web` after configuring local `.env` files and starting local
Supabase. On a clean checkout, run `pnpm openapi:generate` before `pnpm verify`
to create its ignored comparison input. Destructive database commands remain
guarded by the existing loopback endpoint checks.

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
