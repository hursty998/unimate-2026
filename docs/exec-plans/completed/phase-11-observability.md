# Phase 11: Observability

Status: complete. Scope was Phase 11 only; Phase 12 and later work were excluded.

## Baseline evidence

- `development` is clean at `c5d59e2`, which includes the notification-interaction work.
- Local PostgreSQL accepts connections and all six committed Prisma migrations are applied.
- `@unimate/observability` already exposes `TelemetryProvider` and an OpenTelemetry API adapter; worker spans already cover `outbox.dispatch` and `job.process`.
- Outbox jobs use a strict envelope whose stable ID is the Outbox UUID. The API has public liveness at `/v1/system/health`; no readiness probe exists.
- API and worker runtime reporting still uses console prose. `OutboxMessage` has no lineage columns.

## Decisions

- Preserve `TelemetryProvider`; add only propagation operations required by the async boundary. Keep logging, error reporting, execution context, and tracing as distinct seams.
- `StructuredLogger` is a Pino JSON-line adapter; `ErrorReporter` remains provider-neutral and emits safe categories locally. `AsyncLocalStorage` keeps request/job execution context isolated.
- The API generates request UUIDs and uses each as the root correlation ID. Response headers expose both; caller headers do not set canonical lineage.
- API and worker bootstrap manual OpenTelemetry Node SDK runtimes before creating runtime providers. No-export, explicit console, OTLP, and injected in-memory export are supported without auto-instrumentation.
- The Phase 11 migration adds required `OutboxMessage.correlationId` and nullable W3C `traceparent`/`tracestate`. Optional strict job-envelope metadata remains backward-compatible.
- Dispatcher creates a child `outbox.dispatch` span and propagates its W3C context in the queue envelope. Worker extracts that context for `job.process`; queue reliability semantics and Outbox-as-job-ID remain unchanged.
- The authenticated observability proof reuses `foundation.task.complete` v1 and is excluded from production composition. Liveness remains dependency-free; public readiness performs a bounded PostgreSQL-only check and returns 503 when unavailable.
- Prisma 7.10 query extensions report semantic timing for slow operations only; SQL and arguments are not captured.
- Mobile Sentry initializes only with a configured public DSN. PII, user/request/breadcrumb/extra data, tracing, screenshots, sessions, and replay remain disabled. No native configuration or release upload was added.

## Verification evidence

- Focused API/worker/observability/jobs/mobile tests passed, including logger redaction, concurrent-context isolation, no-export active trace context, W3C parentage, retry/dead-letter lineage, error-report policy, and readiness failure safety.
- `pnpm observability:test` and the final prepared integration passed against local API, PostgreSQL, PGMQ, and worker. Machine-readable evidence confirmed the same correlation ID and trace ID across API, Outbox, dispatch, and worker; fixtures were cleaned.
- The forward migration was applied locally. The protected app-schema-only reset proved migration-from-zero; repeated local seeds remained idempotent; database integration assertions confirmed Supabase-owned schemas remained present.
- Prisma slow-query timing passed both above-threshold and below-threshold checks without SQL/argument output.
- The UniMate retrospective found no further durable guidance change warranted. A local database fixture overlap came from running two integrations concurrently during development; serialized verification passed, and canonical `pnpm verify` runs integrations sequentially.
- `pnpm verify:changed` passed. The single final `pnpm verify` passed in 21.6 seconds with all 14 steps, including observability integration. `pnpm secrets:check`, `git diff --check`, and `pnpm git-diff` were run for handoff.

## Handoff

- Approximate elapsed implementation time: about one hour.
- No hosted infrastructure, native/cloud build, Phase 12 work, analytics, Sentry account setup, commit, or push occurred.

## Scope guard

No hosted infrastructure, analytics, native/cloud builds, Sentry setup/source maps, Phase 12 work, or Git commit/push.
