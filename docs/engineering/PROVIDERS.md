# Provider Boundaries

UniMate adds a port only for infrastructure that is realistically replaceable.
Feature code depends on a UniMate-owned port, not a provider SDK or response
type. Provider adapters are separate package subpaths and are restricted from
feature code by the central ESLint configuration.

## Identity

Phase 5 already owns the identity seam: `AccessTokenVerifier`, the Supabase
asymmetric-JWKS adapter, verified provider identity, `AuthIdentity` mapping to
UniMate `User`, and the mobile Auth adapter. Phase 7 reuses it; it does not add
another identity/session facade. Ordinary API JWT verification remains
secretless and uses public JWKS.

## Object storage

`@unimate/storage` exposes `ObjectStorage`:

- `createUploadPermission({ key, contentType })`;
- `createReadPermission({ key, expiresInSeconds })`;
- `deleteObject(key)`.

An `ObjectKey` is a relative slash-separated sequence of ASCII path segments.
Empty segments and `.`/`..` traversal segments are rejected. Use provider-
neutral keys such as `phase7-tests/<opaque-id>.txt`; do not invent product
paths before product resources exist. Signed URLs are temporary capabilities,
not durable object identity. Persist keys through the later product feature,
not URLs or bucket endpoints.

`@unimate/storage/supabase` implements the port with the Supabase Storage HTTP
API and server-side `fetch`. Upload permissions use the provider's signed
upload URL and required `PUT` headers; read permissions use expiring signed
URLs. The adapter requires an explicitly injected `sb_secret_` key. Its local
private test bucket is declared in `supabase/config.toml`. If a running local
stack has not loaded that configuration, the integration fixture provisions
and removes the bucket through the supported local Storage API; it never
modifies Storage-owned tables. Tests round-trip a unique synthetic object and
delete it in `finally`.

## Queue

`@unimate/queue` exposes `JobQueue`: enqueue JSON, receive a bounded batch with
an explicit visibility timeout, and acknowledge an opaque message ID. The
Supabase adapter uses documented PGMQ functions (`send`, `read`, `delete`)
through a pooled PostgreSQL connection. Queue internals are not exposed over
PostgREST, and provider SQL stays inside `@unimate/queue/supabase`.

An unacknowledged message becomes visible again after its timeout; acknowledging
deletes it. This is at-least-once delivery. There are no hidden retries or
worker policies. A provider-only Supabase migration enables pgmq outside the
Prisma-owned `app` schema. Phase 9 owns the versioned/Zod-validated job
envelope, idempotent handlers, retry/DLQ policy, worker, and outbox dispatch.

## Push delivery

`@unimate/notifications` exposes only `PushProvider.send` for one destination
token and a title/body/JSON payload. `@unimate/notifications/expo` uses native
`fetch` and Expo's documented HTTP endpoint. Success does not expose an Expo
ticket ID. `PushProviderError` maps invalid tokens, transient failures, and
permanent provider rejections without retaining or logging provider payloads.
There is no token registration, notification persistence, batching, or
orchestration in this phase.

## Telemetry

`@unimate/observability` exposes `TelemetryProvider.runInSpan`, using standard
OpenTelemetry `Span` concepts for attributes, exceptions, and success/failure
status. `@unimate/observability/opentelemetry` uses `@opentelemetry/api`;
tests use the in-memory exporter from `@opentelemetry/sdk-trace-base`. No
collector, exporter, metrics, or hosted observability backend is configured.

## Configuration and verification

Adapters receive explicit options at their server-side composition boundary:
Supabase URL/secret/bucket for Storage, a server-only PostgreSQL connection
string/queue name for PGMQ, and the standard Expo endpoint. This foundation
does not wire adapters into API features or require provider env vars before a
real operation uses them. Never put these credentials in `EXPO_PUBLIC_*`.
Provider credentials are unrelated to the Phase 5 JWKS verifier.

`pnpm providers:test` builds and runs provider-free unit tests, ensures local
Supabase is available, applies pending migrations with `--local`, and runs the
Storage/Queues integration tests. It never links to or modifies a hosted
project. Full `pnpm verify` runs those deterministic local integrations;
`pnpm verify:changed` remains provider-integration-free. Push tests use a
mocked `fetch`, and telemetry tests use an in-memory exporter.

## Deferred

Product file ownership/metadata and upload endpoints, notification models and
preferences, device-token registration, final notification behaviour, email,
worker execution, business jobs, the job envelope, retries/DLQ orchestration,
outbox dispatch, and a real telemetry exporter/backend remain with later
phases.
