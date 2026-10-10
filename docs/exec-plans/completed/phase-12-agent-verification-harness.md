# Phase 12 — Agent Verification Harness

## Baseline

- Began clean on `development` at `7a714be`; Phase 11 observability was
  committed. Local Supabase/PostgreSQL was available and migrations were
  current.
- Full: 14 sequential steps, ~21.8s runner time (22.0s real). Per-step seconds:
  format 2.1, tooling 1.0, secrets 0.6, Turbo lint/typecheck/build/tests 1.3,
  OpenAPI 0.5, DB check 1.9, DB/auth/storage-proof/push/authorization/providers/
  worker/observability integrations 0.7/2.3/1.7/0.8/0.7/2.1/3.6/2.4.
- Changed: 3 local/code steps, ~4.4s runner time (4.6s real); format 2.2,
  tooling 0.9, affected Turbo 1.2. No DB/Supabase or integration dependency.
- Baseline OpenAPI generation could overwrite the tracked JSON. Turbo writes
  ignored build output; integrations clean their fixtures except the intended
  local storage-proof private bucket. Successful logs are temporary.

## Delivered

- Preserved the existing 14-step full and 3-step changed lanes. Added optional
  schema-v1 JSON reports to the same sequential runner, with per-step results,
  bounded failure output, preserved failure logs, and success-log cleanup.
- Added runner tests for JSON pass/fail/write-error cases, unrun steps,
  durations, large output, stop-on-failure, spawn errors, sequential execution,
  and SIGINT/SIGTERM forwarding through `pnpm` without an orphaned child.
- Exported lane definitions and added a deterministic invariant: each root
  `*:test:prepared` integration script is present exactly once in full and
  absent from changed; secret scanning remains full-only.
- Split OpenAPI document construction/serialization from explicit generation.
  Full verification compares without mutation; `pnpm openapi:generate` remains
  the repair command. Removed the now-unused prepared generator aliases.
- Scoped ESLint restrictions for direct console logging to API/worker runtime
  source, excluding tests and test support. Existing provider, access-posture,
  compiler, database, mobile-boundary, and secret checks remain in place.
- Added [`VERIFICATION.md`](../../engineering/VERIFICATION.md), linked it from
  agent guidance, and pruned stale Phase 12 candidate-work wording.

## Audit decisions

- Unit and architecture tests run through tooling tests or Turbo package test
  scripts. API/auth, database, storage, push, authorization, provider, worker,
  and observability integrations are wired to the canonical full lane without
  duplicate preparation. No important test lane was found unwired.
- Keep integrations serial; no cross-process lock is justified. API/worker
  `tsconfig` still emits tests/test-support into `dist`; defer packaging
  separation to Phase 15 to avoid complicating the existing build/test flow.
- No coverage/debt score, Markdown parser, extra dependency, or separate test
  inventory was justified. JSON step inventory is sufficient for now.
- Phase 13 browser/native smoke, Phase 14 EAS, Phase 15 CI, agent evaluations,
  and PostHog/product analytics remain deferred.

## Retrospective and verification

- Largest remaining friction is local integration setup/shared fixture state.
  Canonical sequencing is already safe and cheap; document serial manual runs
  rather than add lock infrastructure.
- Focused tooling tests: 30 passed. API build and API unit/architecture/OpenAPI
  tests: 43 passed. OpenAPI generation/check, prepared-lane omission fixture,
  runtime-console lint fixture, and runner interruption fixtures passed.
- Final changed verification: 8.8s runner time (9.1s real), versus 4.4s
  baseline; the affected tasks now execute for this change.
- One final full verification, with JSON mode: 14/14 passed in 21.9s runner
  time (22.2s real), versus 21.8s baseline. The parsed report was valid,
  schemaVersion 1, mode `full`, status `passed`.
- Standalone secret scan and `git diff --check` passed. No migrations,
  hosted-service changes, native/cloud builds, CI, commits, or pushes.
