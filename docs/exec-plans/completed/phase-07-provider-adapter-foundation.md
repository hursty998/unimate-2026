# Phase 7 — Provider Adapter Foundation

**Status:** Complete
**Scope:** Storage, queue, push delivery, and telemetry provider seams only.

## Verified starting state

- Physical checkout: `/Users/henry/Documents/Projects/UniMates-2026/unimate-2026`
- Branch: `development`; origin: `https://github.com/hursty998/unimate-2026.git`
- Worktree clean; HEAD `3c2ef46` includes the committed Phase 6.5 work.
- Local Supabase is running at loopback; optional imgproxy and pooler services
  are stopped. PostgreSQL at `127.0.0.1:55322` accepts connections.
- Prisma reports all three existing application migrations applied.
- The local database does not have pgmq installed yet. Its extension is
  available locally as version `1.5.1`.
- `packages/storage`, `packages/queue`, `packages/notifications`,
  `packages/observability`, and `packages/config` are placeholders. The API
  uses `SUPABASE_URL` only for secretless JWKS authentication. `apps/worker`
  remains a reserved workspace.

## Decisions

| Area               | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity           | Reuse Phase 5 `AccessTokenVerifier`, asymmetric JWKS adapter, verified identity, `AuthIdentity`/`User` mapping, and mobile Auth adapter. Do not add another identity provider abstraction.                                                                                                                                                                                                                                                         |
| Storage            | Keep durable identity as a validated provider-neutral relative object key. The port creates short-lived upload/read permissions and deletes one key; it never exposes SDK response types or persists provider URLs. Supabase Storage is implemented with server-side `fetch` and the current `sb_secret_` credential.                                                                                                                              |
| Storage local test | Declare the private `phase7-provider-tests` bucket in supported `supabase/config.toml`. When an already-running stack has not loaded the config, the test harness creates the bucket with the supported local Storage HTTP API and deletes it in `finally`; it does not edit Storage-owned tables or restart the shared stack. Round-trip a unique synthetic object key through signed upload/read permissions and delete the object in `finally`. |
| Queue              | Use `pg` 8.23.1 and documented `pgmq` functions only inside the Supabase adapter. The port supports enqueue, visibility-bounded receive, and acknowledgement. A failed/unacknowledged delivery becomes visible again after its visibility timeout; no retry policy or hidden retry is added. Phase 9 owns the versioned/Zod-validated job envelope, retry policy, dead-letter flow, worker, and outbox dispatch.                                   |
| Queue local test   | Add a Supabase provider migration enabling the available pgmq extension (not a Prisma migration and no `app` schema objects). Create a unique synthetic queue with documented `pgmq.create`, prove send/read/delete semantics, and drop the queue in `finally`. The command applies only local migrations.                                                                                                                                         |
| Push               | Define a single-destination server-side delivery port. Use native `fetch` against Expo's documented `https://exp.host/--/api/v2/push/send` endpoint; no Expo SDK, no batching, no live push, and no provider ticket type in the port. Map invalid-token, rejection, and transient-provider failures to UniMate-owned outcomes.                                                                                                                     |
| Telemetry          | Keep the small UniMate `TelemetryProvider` seam on standard OpenTelemetry span concepts. Production dependency: `@opentelemetry/api` 1.9.1. Tests use `@opentelemetry/sdk-trace-base` 2.12.0 with its in-memory exporter/processor; no collector or hosted exporter is configured.                                                                                                                                                                 |
| Dependency policy  | Exact-pin only the OpenTelemetry packages above and `pg` 8.23.1 in the queue package. Do not add `@supabase/supabase-js`, `expo-server-sdk`, or native dependencies; Node `fetch` and the existing PostgreSQL driver are sufficient. The registry currently reports `@supabase/supabase-js` 2.117.3, but it is not needed.                                                                                                                         |
| Secrets            | Provider adapters receive explicit server-only options. Local integration obtains current Supabase values in memory from `supabase status -o json`; never serialize them to logs/files or expose them through `EXPO_PUBLIC_*`. JWT verification remains public-JWKS-only.                                                                                                                                                                          |
| Boundaries         | Keep port entry points distinct from provider implementation subpaths; extend the existing central ESLint `no-restricted-imports` rules. Product code may consume ports, while mobile cannot import server adapters, queue, push delivery, or telemetry implementation.                                                                                                                                                                            |
| Verification       | Pure provider unit tests remain part of affected Turbo tests. A self-contained provider integration command prepares package builds, applies only local Supabase provider migrations, and runs storage/queue tests. Add only its prepared integration step to full `pnpm verify`; keep `pnpm verify:changed` integration-free.                                                                                                                     |

## Provider API evidence

- Supabase Storage documents signed upload permissions (two-hour validity),
  expiring signed reads, and object deletion. Supabase Queues documents
  `pgmq.create`, `pgmq.send`, `pgmq.read`, `pgmq.delete`, and `pgmq.drop_queue`.
  Queue `read` uses a visibility timeout and leaves the message queued until
  acknowledgement/deletion. Queues are not exposed over PostgREST by default;
  use a server PostgreSQL connection rather than exposing `pgmq_public`.
- Expo's current Push HTTP API accepts a single message or batches of up to
  100; this port intentionally sends one message and maps the
  `DeviceNotRegistered` ticket without leaking Expo response objects.
- OpenTelemetry's standard Tracer/Span API provides attributes, exception
  recording, and status. The in-memory SDK exporter is test-only.
- The Supabase MCP docs transport was unavailable in this environment. Current
  official Supabase pages and Context7 documentation were used instead. The
  changelog was checked; no current Storage/Queues breaking change alters the
  APIs selected here.

## Implementation record

### Ports and implementations

- `ObjectStorage` exposes scoped upload/read permissions and one-object
  deletion. `ObjectKey` is a branded, validated relative ASCII path; signed
  provider URLs are temporary capabilities only. `SupabaseObjectStorage`
  uses documented Storage HTTP routes and Node `fetch`.
- `JobQueue` exposes JSON enqueue, receive with explicit visibility timeout
  and count, and boolean acknowledgement using an opaque message ID. The
  Supabase adapter isolates parameterized `pgmq.send`, `read`, and `delete`
  calls behind a pooled `pg` connection. PGMQ creation/drop operations exist
  only in integration-test support. No stable job envelope is added; Phase 9
  owns versioned job schemas and validation.
- `PushProvider.send` handles one provider-neutral token/title/body/data
  message. The Expo adapter uses `fetch` and maps invalid-token, transient,
  and rejected failures to `PushProviderError`; it does not expose ticket IDs
  or provider response objects.
- `TelemetryProvider.runInSpan` accepts standard OpenTelemetry attributes and
  spans, records exceptions, maps success/failure status, and always ends the
  span. The implementation uses the OTel API with an in-memory SDK exporter
  only in tests.

### Exact dependencies and API choices

- Direct provider dependencies are exact-pinned: `pg` 8.23.1,
  `@opentelemetry/api` 1.9.1, and test-only
  `@opentelemetry/sdk-trace-base` 2.12.0. `@types/pg` is 8.23.1. The shared
  Node/TypeScript toolchain remains pinned at `@types/node` 24.19.1,
  TypeScript 6.0.3, pnpm 10.33.0.
- The installed Supabase CLI is 2.104.0. Its local PostgreSQL 17 image
  provides pgmq 1.5.1. The provider migration was generated by the CLI and
  installs only pgmq outside Prisma-owned schema `app`.
- Supabase Storage uses the current signed-upload (two-hour) and expiring
  signed-read API shapes. Expo uses the current
  `https://exp.host/--/api/v2/push/send` endpoint and ticket-error mapping.
- Native `fetch` is used for Supabase Storage and Expo Push; `pg` is used for
  Supabase Queues. No `@supabase/supabase-js`, `expo-server-sdk`, or native
  dependency was added. The registry's current Supabase JS 2.117.3 was
  considered and deliberately not installed.

### Configuration and boundaries

- No new environment variables or public/mobile configuration were added:
  the API does not compose any of these adapters yet. Explicit adapter options
  carry `supabaseUrl`, server-only `sb_secret_` key and bucket name for
  Storage; a server-only PostgreSQL connection string and queue name for
  PGMQ; and no provider secret for Expo Push. Telemetry uses a standard OTel
  tracer. No provider secret enters Expo or `EXPO_PUBLIC_*`.
- Local tests read the current local Supabase values in memory from
  `supabase status -o json`, require loopback API/database URLs, and use
  `supabase migration up --local`. Storage's test bucket is declared through
  supported local config; when the already-running stack has not applied that
  config, a test-only helper provisions/removes the bucket through the
  supported Storage API. It never edits provider tables.
- ESLint restricts feature code from adapter subpaths and provider SDKs,
  prevents mobile access to server queue/push/storage/telemetry adapters,
  permits the explicit future API composition directory to wire adapter
  subpaths without importing vendor SDKs, and prevents provider packages from
  depending on unrelated provider packages. Tooling tests exercise these
  restrictions.

### Deviations

- No `.env.example` entries were added because no API/worker composition
  consumes these ports yet. Provider configuration is explicit in the
  adapter-constructor types; introducing unused server secrets/connection
  values into application configuration would create a premature contract.
- The running local Storage service did not apply the new bucket config during
  `supabase start`. The integration fixture therefore creates the missing
  test bucket with the supported local Storage API and deletes it afterward;
  fresh local stacks still use the committed `config.toml` bucket definition.
- Supabase Queues was not installed in the local database at preflight.
  The generated provider-only migration enables the documented extension;
  Prisma schema and the application `app` schema remain unchanged.

### Local integration evidence

- `pnpm providers:test` passes both deterministic local integrations:
  Storage creates scoped upload/read permissions, uploads via the signed
  mechanism, round-trips bytes, and deletes the object; PGMQ proves enqueue,
  reservation visibility, re-delivery after one second, acknowledgement, and
  removal. All test data and test-only bucket/queue artefacts are cleaned in
  `finally`.
- The local pgmq extension is installed at 1.5.1; verification found zero
  remaining `phase7-test-*` queues and no leftover dynamically provisioned
  Storage test bucket. No hosted project was linked or modified.

### Tests and retrospective

- Focused lint/typecheck/build/unit checks pass for all four provider
  packages. `pnpm test:tooling` passes the provider-import boundary tests.
  `pnpm format:check` passes. `pnpm verify:changed` is the fast
  integration-free check and remains configured without provider integration.
- `pnpm verify:changed` passes on the final implementation tree. The final
  canonical `pnpm verify` passes in 13.1 seconds, including database,
  authentication/JWKS, authorization, and provider integration checks.
- `pnpm providers:test` passes both real local provider integrations;
  `pnpm test:tooling` and `pnpm format:check` pass.
- Retrospective result: no additional durable agent/workflow change was
  justified. The provider boundary tests and standalone local integration
  harness are the durable checks for the friction observed in this phase;
  one-off CLI/API setup errors were corrected without broadening repository
  guidance.
- Authentication regression is included in the passing full verification.
  The final exact-key credential scan found no local Supabase secret in
  changed/untracked files or the generated diff report, and no server secret
  or database credential markers in mobile files. `git diff --check` and the
  final `pnpm git-diff` review passed. No commit or push was made.

## Deliberately deferred

No product-domain models, endpoints, file ownership, uploads API, notification
records/preferences/token registration/orchestration, worker, business jobs,
versioned job envelope, retry/DLQ engine, outbox dispatcher, email provider,
real telemetry exporter/backend, hosted provider operation, native build, or
EAS build is in scope.
