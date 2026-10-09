# Background Jobs

Phase 9 proves the transactional-outbox path with one foundation-only task.
Product jobs remain owned by their future product phases.

## Ownership and flow

```text
application transaction
├── application state
└── OutboxMessage
        ↓
worker outbox dispatcher
        ↓
JobQueue
        ↓
durable Supabase Queue
        ↓
worker validates and dispatches
        ↓
idempotent handler
        ↓
acknowledgement
```

The application transaction writes state and its `OutboxMessage` together; it
does not enqueue after commit. The worker owns dispatch and queue consumption.
`@unimate/jobs` owns job names, versions, and Zod schemas;
`@unimate/queue` owns transport and message delivery; `apps/worker` owns
polling, handler lookup, retries, and process lifecycle.

## Outbox and delivery guarantees

The dispatcher selects unpublished rows in stable `(createdAt, id)` order and
claims one at a time with PostgreSQL `FOR UPDATE SKIP LOCKED`. It keeps the row
lock through queue acceptance and the `publishedAt` update in the same short
transaction. A queue failure rolls that transaction back. `publishedAt` means
the queue accepted the message, not that a handler completed it.

The envelope ID is the Outbox UUID, so redispatch produces the same logical
job. Queue acceptance followed by a database rollback can publish a duplicate;
this is expected at-least-once behaviour, not an exactly-once guarantee.
Handlers must make their database side effects idempotent.

## Envelope and handlers

Every message has a strict JSON envelope with a stable UUID `id`, known string
`type`, positive integer `version`, and JSON `payload`. The worker validates
the envelope, then resolves an explicit type/version handler whose versioned
payload schema is strict. Malformed, unknown, or unsupported jobs are
permanent failures and never reach a handler.

Once a job type/version may exist in the outbox, active queue, or archive, its
payload meaning is immutable: incompatible changes require a new version.
Keep old handlers while work for those versions may remain; removing one
requires an explicit operational or migration decision.

The only foundation job is `foundation.task.complete` version 1. Its payload
contains only the stable `taskId`. The handler completes an existing
foundation task only while `completedAt` is null; redelivery is a successful
no-op that preserves the first completion time. A missing task is permanent.

## Retry and dead-letter policy

Retryable handler failures remain unacknowledged. The queue visibility timeout
then permits redelivery and increments the delivery count; the worker does not
retry inside one delivery. Permanent failures are dead-lettered immediately.
Other failures are dead-lettered when the configured maximum delivery count is
reached.

The provider-neutral `JobQueue.deadLetter(messageId)` operation uses PGMQ's
documented archive operation. Successful dead-lettering removes the message
from active delivery and retains provider data as an operational archive
record. If archiving fails, the worker does not acknowledge the active message.
Replay and queue administration tooling are deferred.

After a handler succeeds, an acknowledgement result of `false` means the
message is already absent/finalised. If acknowledgement throws, its state is
uncertain: do not dead-letter because of the delivery limit; leave the message
unacknowledged and allow possible redelivery. The side effect is not undone,
and handler idempotency makes that redelivery safe. Maximum attempts bound
repeated processing failures, not an otherwise successful handler's ambiguous
acknowledgement.

## Runtime and observability

The worker attempts outbox dispatch and then consumes already-queued messages
even if dispatch failed. Cycle results retain dispatch/consume failures for
reporting; continuous mode backs off after a failed cycle, and `--once` reports
failure after its queue-consumption attempt.

`WORKER_BATCH_SIZE` is the per-cycle maximum. The worker receives at most one
message immediately before processing it, then repeats sequentially so later
messages are not reserved while waiting behind a handler. A handler should
normally finish within the configured visibility timeout. Duplicate delivery
remains possible and handlers remain idempotent; visibility extension/leases
may be added later if genuinely long-running jobs require them. `--once` runs
one deterministic cycle. Continuous mode waits between empty/error cycles,
handles SIGINT/SIGTERM, and closes its database and queue clients.

Worker spans cover outbox dispatch and job processing. Attributes are limited
to identifiers and delivery metadata such as `outbox.id`, `job.id`, `job.type`,
`job.version`, `queue.message_id`, and `queue.delivery_count`. Payloads,
credentials, tokens, and user content are not recorded. A production exporter,
structured logs, correlation IDs, and complete API-to-worker traceability
remain Phase 11 work.

## Local verification

`pnpm worker:test` builds the workspace prerequisites and runs a loopback-only
integration against local PostgreSQL and a synthetic PGMQ queue.
`pnpm worker:test:prepared` is for the canonical verification flow after
build/generated prerequisites are ready. `pnpm verify:changed` intentionally
does not run local integrations.

Push notifications and their first job remain Phase 10. Product jobs,
scheduling, deployment, dead-letter replay, and operational UI are not part of
this foundation.
