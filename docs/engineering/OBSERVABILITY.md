# Observability

UniMate keeps operational observability separate from product analytics.
Structured logs, traces, error reporting, database timing, and probes do not
record funnels, screen views, session replay, or arbitrary user activity.

## Structured logs and context

API and worker output uses Pino JSON lines with ISO `timestamp`, string `level`,
`service`, `environment`, and stable `event` fields. Request/job context and the
active OpenTelemetry `trace_id` and `span_id` are added automatically when
available. Common events include `http.request.completed`,
`outbox.dispatch.completed`, `job.processing.completed`,
`job.processing.failed`, `worker.cycle.completed`, `process.started`, and
`process.stopping`.

Every HTTP request gets a server-generated UUID `request_id`; a root request
uses the same UUID for `correlation_id`. Caller-supplied request/correlation
headers are ignored. Responses return `x-request-id` and `x-correlation-id`.
Node `AsyncLocalStorage` isolates request and job context across concurrent
work.

Never log raw headers, query strings, request/response bodies, job or queue
payloads, SQL, Prisma arguments, provider responses, tokens, passwords,
connection URLs, signed URLs, or environment objects. Pino redacts common
sensitive key names as defense in depth; application code must still emit only
known safe fields. Error logs contain bounded error categories, never exception
messages or stacks. Health/readiness success logs are suppressed.

## Traces and asynchronous lineage

API and worker each start a manual OpenTelemetry Node SDK runtime before
creating their telemetry providers. The API creates a root server span for
every request. `outbox.dispatch` restores the Outbox trace context; the queued
envelope carries the dispatch span's W3C `traceparent`/optional `tracestate`.
`job.process` extracts that context, so its trace ID is the same as the
originating API request. The job ID remains the Outbox UUID.

`OutboxMessage.correlationId` is required; `traceparent` and `tracestate` are
dedicated nullable columns. Work created outside a request gets a fresh
correlation UUID. The strict job envelope accepts optional observability
metadata so older queued messages remain valid. Direct worker-created queue
jobs inherit the current correlation and trace context.

`OBSERVABILITY_TRACE_EXPORTER` accepts `none`, `console`, or `otlp` and defaults
to `none`; no collector is required for local tests. OTLP requires
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, an HTTP(S) endpoint without URL
credentials or query parameters. Tests may inject an in-memory exporter. Pino,
not the OpenTelemetry Logs API, is the structured logging system. Exporter
shutdown is bounded and runs with API/worker resource shutdown.

## Errors and mobile reporting

`ErrorReporter.captureException(error, context?)` is the small provider-neutral
error seam. API 5xx failures, fatal process errors, and exhausted unexpected
worker failures use it. Validation/auth errors and ordinary retryable provider
outcomes are not error reports. The default server adapter emits only a safe
structured error category; no hosted account is required.

The already-installed mobile Sentry SDK initializes only when
`EXPO_PUBLIC_SENTRY_DSN` is configured. Default PII, breadcrumbs, request/user
data, screenshots, view hierarchy, tracing, session tracking, and replay are
disabled or removed. No app user identity, push token, signed URL, or arbitrary
app state is attached. This is JavaScript-only setup; native configuration,
source-map upload, and hosted Sentry provisioning are deferred.

## Database timing

Prisma 7.10 query extensions measure semantic operation duration. Only
operations at or above `DATABASE_SLOW_QUERY_THRESHOLD_MS` (default 250 ms)
emit `database.query.slow` with `duration_ms`, `threshold_ms`, and model/
operation when available. Raw operations omit the model. SQL text, parameters,
and Prisma arguments are never captured. Observer callbacks are best-effort:
their failures never change the result of the database operation.

## Health and readiness

`GET /v1/system/health` remains cheap liveness and does not query PostgreSQL or
call external services. `GET /v1/system/readiness` is a narrow public Nest
probe outside the oRPC contract because it must return native HTTP 503 status.
It has explicit `@Public()` access posture. It runs a bounded `SELECT 1`
against PostgreSQL, returns
`{"status":"ready"}` with 200, or `{"status":"not_ready"}` with 503. It exposes
no infrastructure details and does not depend on OTLP or error reporting.

## Local verification and debugging

- `pnpm observability:test` builds and runs the local authenticated API →
  PostgreSQL/Outbox → PGMQ → worker proof.
- `pnpm observability:test:prepared` runs that proof after canonical build and
  migration preparation.
- `pnpm db:test` checks physical schema and slow-query timing against local
  PostgreSQL.
- Set `OBSERVABILITY_LOG_LEVEL=debug` for more local structured logs.
- Set `OBSERVABILITY_TRACE_EXPORTER=console` to emit spans locally, or configure
  `OBSERVABILITY_TRACE_EXPORTER=otlp` and the endpoint above. Neither is enabled
  by default.

Hosted tracing, production sampling policy, metrics infrastructure, dashboards,
alerting, source-map/release upload, and product analytics remain deferred.
