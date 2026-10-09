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
- `getObjectMetadata(key)`, returning provider-neutral content type and size or
  `null` when no file exists;
- `deleteObject(key)`.

An `ObjectKey` is a relative slash-separated sequence of ASCII path segments.
Empty segments and `.`/`..` traversal segments are rejected. Use provider-
neutral keys such as `phase7-tests/<opaque-id>.txt` or
`foundation-storage-proof/<opaque-id>.txt`; do not invent product paths before
product resources exist. Signed URLs are temporary capabilities, not durable
object identity. Persist keys through the consuming application feature, not
URLs or bucket endpoints.

`@unimate/storage/supabase` implements the port with the Supabase Storage HTTP
API and server-side `fetch`. Upload permissions use the provider's signed
upload URL and required `PUT` headers; read permissions use expiring signed
URLs. Object metadata inspection uses the supported Storage object-list API
with an exact parent path/name match, so upload completion can verify the file
without exposing provider response types. The adapter requires an explicitly
injected `sb_secret_` key. Its private local provider-test and foundation-proof
buckets are declared in `supabase/config.toml`. Provider tests provision and
remove only their own temporary bucket through the supported local Storage API.
The storage-proof integration idempotently provisions its dedicated private
bucket and leaves it available for web/native runtime proof. These flows never
modify Storage-owned tables.

## Queue

`@unimate/queue` exposes `JobQueue`: enqueue JSON, receive a bounded batch with
an explicit visibility timeout, acknowledge an opaque message ID, and
dead-letter a message. The Supabase adapter uses documented PGMQ functions
(`send`, `read`, `delete`, `archive`) through a pooled PostgreSQL connection.
Queue internals are not exposed over PostgREST, and provider SQL stays inside
`@unimate/queue/supabase`.

An unacknowledged message becomes visible again after its timeout; acknowledging
deletes it. Dead-lettering archives the active message; a successful archive
stops active redelivery and retains provider data as an operational record.
There are no hidden queue retries or handler policies. A provider-only
Supabase migration enables pgmq and creates the durable foundation queue
outside the Prisma-owned `app` schema. Phase 9's `apps/worker` composes the
provider with `@unimate/jobs`, the database, and observability; details are in
[`BACKGROUND_JOBS.md`](./BACKGROUND_JOBS.md).

## Push delivery

`@unimate/notifications` exposes only `PushProvider.send` for one destination
token and a title/body/JSON payload. `@unimate/notifications/expo` uses native
`fetch` and Expo's documented HTTP endpoint. A successful send returns a
provider-neutral opaque submission handle containing the ticket identifier;
the later receipt-checking worker/orchestration phase needs it to query the
eventual Expo receipt. Receipt polling is not implemented here.
`PushProviderError` maps invalid tokens, transient failures, and permanent
provider rejections without retaining or logging provider payloads. There is
no token registration, notification persistence, batching, or orchestration
in this phase.

## Telemetry

`@unimate/observability` exposes `TelemetryProvider.runInSpan`, using standard
OpenTelemetry `Span` concepts for attributes, exceptions, and success/failure
status. Successful completion leaves status UNSET unless the operation sets
one; thrown failures are recorded and marked ERROR.
`@unimate/observability/opentelemetry` uses `@opentelemetry/api`;
tests use the in-memory exporter from `@opentelemetry/sdk-trace-base`. No
collector, exporter, metrics, or hosted observability backend is configured.

## Configuration and verification

Adapters receive explicit options at their server-side composition boundary:
Supabase URL/secret/bucket for Storage, a server-only PostgreSQL connection
string/queue name for PGMQ, and the standard Expo endpoint. Phase 8 wires the
storage adapter through `apps/api/src/providers`; Phase 9 wires queue access
only through `apps/worker`. Feature handlers consume provider-neutral ports.
Never put provider credentials in `EXPO_PUBLIC_*`. The Storage secret is
unrelated to the Phase 5 JWKS verifier.

`pnpm providers:test` builds and runs provider-free unit tests, ensures local
Supabase is available, applies pending migrations with `--local`, and runs the
Storage/Queues integration tests. It never links to or modifies a hosted
project. Full `pnpm verify` runs those deterministic local integrations;
it also runs `pnpm secrets:check` over changed and untracked repository files.
`pnpm verify:changed` remains provider-integration-free. Push tests use a
mocked `fetch`, and telemetry tests use an in-memory exporter.

## Deferred

Product-specific file ownership/metadata and upload endpoints, notification
models and preferences, device-token registration, push-job behaviour, email,
business jobs, a real telemetry exporter/backend, and complete
request-to-worker traceability remain with later phases.
