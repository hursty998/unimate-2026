# Phase 9 - Outbox, Queue + Worker

## Goal

Prove reliable asynchronous execution without introducing product jobs or
changing the existing `OutboxMessage` model.

## Starting evidence

- `development` is clean and tracks `origin/development`.
- Phase 8 hardening (`6ac3e51`) is present in history.
- Local Supabase is healthy; `pnpm db:check` confirms PostgreSQL reachability
  and all current Prisma migrations are applied.
- `OutboxMessage` already provides UUIDv7 identity, event type, positive
  payload version, JSONB payload, creation time, and publication time.
- `@unimate/queue` already provides PGMQ enqueue, bounded receive, delivery
  count, acknowledgement, and provider-neutral errors.

## Decisions

- Add a foundation-only task row as the atomic producer state; its completion
  timestamp is the idempotent side effect.
- Reuse the outbox ID as the stable job ID across redispatch.
- Lock one unpublished outbox row per short Prisma transaction using
  `FOR UPDATE SKIP LOCKED`; retain the lock through queue acceptance and the
  `publishedAt` update.
- Extend the existing queue port with `deadLetter`; Supabase implements it
  with documented `pgmq.archive`.
- Keep job schema/version semantics in `@unimate/jobs`; keep dispatch,
  handler lookup, retry policy, and lifecycle in `apps/worker`.
- Use a durable local provider queue and isolated synthetic queues in tests.
- Accept the enqueue/commit crash window and prove duplicate handling through
  database-backed idempotency; do not claim exactly-once delivery.

## Implementation and evidence

- Reused `OutboxMessage`; added only `FoundationAsyncTask` and
  `@unimate/jobs` with the strict `foundation.task.complete` v1 schema.
- Added provider-neutral `JobQueue.deadLetter`; Supabase uses documented
  `pgmq.archive` boolean semantics. The provider migration provisions the
  durable `unimate_foundation_jobs` queue.
- Dispatcher claims one ordered row per transaction with
  `FOR UPDATE SKIP LOCKED`, holding its lock through enqueue and `publishedAt`.
  Stable Outbox IDs tolerate the enqueue/commit crash window.
- Worker composes Prisma, queue, handlers, and telemetry; it supports `--once`
  and signal-aware continuous polling. Retry, permanent failure, maximum
  attempts, archive, and acknowledgement failure are tested.
- Added migration `20261009090137_phase9_foundation_async_task` and provider
  migration `20261009090102_phase9_foundation_jobs_queue`.
- Migration-from-zero reset replayed all five Prisma migrations; repeated
  seeds passed and the database integration verified no task/outbox seed rows
  and preserved Supabase-owned schemas.
- Focused worker/jobs/queue lint, typecheck, build, and unit tests passed.
  `pnpm worker:test`, `pnpm providers:test`, `pnpm db:test`, and
  `pnpm secrets:check` passed. Local worker integration covered rollback,
  concurrent dispatch, PGMQ consumption, retry, dead-letter, duplicate
  redispatch, and acknowledgement failure.
- Retrospective: no additional process/guidance change was durable. The
  concrete issues found (new-package Node types, PGMQ's 48-character name
  limit, and adapter composition boundaries) are fixed and guarded by the
  package dependency, validation test, and worker lint boundary respectively.

## Final validation

- `pnpm worker:test`, `pnpm providers:test`, `pnpm db:test`, and
  `pnpm secrets:check` passed.
- `pnpm verify:changed` passed on its second run; the first run correctly
  stopped on Prettier findings, which were formatted before rerunning.
- The single final `pnpm verify` passed all steps, including the prepared
  worker integration.
- Migration-from-zero replayed all five Prisma migrations. Two subsequent
  deterministic seeds passed; database integration confirmed no async work
  was seeded and the Supabase-owned schemas survived the app reset.
- Retrospective found no additional durable process/guidance change. The
  provider limit and composition-boundary issues are guarded by focused tests
  and lint.
- Approximate elapsed time: 36 minutes. Initial failures were limited to a
  missing new-package type dependency, a generic-vs-payload schema test
  expectation, PGMQ's 48-character queue limit, and formatting; each was
  corrected and its relevant check passed.
