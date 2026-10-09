# UniMate Engineering Architecture

## Status

This document defines the intended engineering architecture for the UniMate foundation.

It describes stable architectural direction rather than detailed product-domain modelling.

The UniMate product/domain model will be implemented only once the approved product architecture is translated deliberately into the database and application model.

---

# 1. Goals

The foundation should support a large, long-lived application that is:

- easy to extend;
- safe for multiple coding agents to work on;
- strongly typed across client/server boundaries;
- testable locally;
- observable;
- secure by default;
- performant as data volume grows;
- deployable independently by application;
- able to replace infrastructure providers where there is a realistic operational reason.

The system should optimise for clear boundaries rather than minimising file count.

---

# 2. Non-goals

The foundation does not attempt to make these interchangeable:

- PostgreSQL;
- Prisma;
- TypeScript;
- Expo/React Native;
- NestJS.

These are intentional application architecture choices.

The foundation does aim to make these reasonably replaceable:

- PostgreSQL hosting provider;
- authentication provider;
- object-storage provider;
- queue provider;
- push-notification provider;
- email provider;
- observability backend.

Provider replaceability must not result in excessive abstraction.

Create a port/adapter only where provider replacement is realistically useful.

---

# 3. Repository architecture

The intended monorepo is:

```text
/
├── apps/
│   ├── mobile/
│   ├── api/
│   └── worker/
│
├── packages/
│   ├── contracts/
│   ├── database/
│   ├── auth/
│   ├── storage/
│   ├── queue/
│   ├── jobs/
│   ├── notifications/
│   ├── observability/
│   ├── config/
│   ├── testing/
│   ├── eslint-config/
│   └── typescript-config/
│
├── supabase/
│
├── docs/
│   ├── engineering/
│   ├── exec-plans/
│   │   ├── active/
│   │   └── completed/
│   └── generated/
│
├── .agents/
│   └── skills/
│
├── AGENTS.md
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── pnpm-lock.yaml
```

This structure may evolve, but changes to top-level boundaries should be deliberate.

---

# 4. Workspace tooling

Use:

- pnpm workspaces;
- Turborepo;
- TypeScript strict mode;
- shared linting/config packages;
- deterministic lockfile-based installs.

Turborepo orchestrates tasks and caching.

It does not define product architecture.

Do not combine Turborepo with a second competing monorepo architecture such as Nest's internal monorepo mode.

---

# 5. Mobile application

`apps/mobile` is an Expo application supporting:

- iOS;
- Android;
- web.

Use Expo Router.

Route files should be thin.

A route should primarily:

- establish navigation;
- read route parameters;
- select the screen/component;
- compose providers where genuinely route-scoped.

Business logic belongs under feature/application modules, not route files.

Conceptually:

```text
apps/mobile/
├── app/
├── src/
│   ├── features/
│   ├── components/
│   ├── providers/
│   ├── hooks/
│   └── bootstrap/
└── ...
```

Do not create the final UniMate design-system package until visual Phase 12B is approved.

Temporary foundation screens should use intentionally minimal styling that is easy to replace.

---

# 6. API application

`apps/api` is a NestJS application.

Use the Fastify adapter unless a proven compatibility problem requires otherwise.

Organise by feature/domain:

```text
apps/api/src/modules/
├── auth/
├── users/
├── universities/
└── ...
```

Within a feature, separate concerns only where useful.

Avoid giant global directories containing every controller/service/repository in the application.

Transport handlers/controllers remain thin.

Business workflows belong in application services/use cases.

---

# 7. Worker

`apps/worker` owns asynchronous dispatch and execution. Phase 9 implements
outbox dispatch, validated job handling, retry/dead-letter policy, and process
lifecycle.

It should use the same configuration, logging, dependency-injection and infrastructure packages where practical.

It does not require an HTTP server unless a later operational need justifies one.

Future product-specific responsibilities may include:

- push notifications;
- email;
- reminder delivery;
- file processing;
- webhook follow-up;
- background maintenance.

Workers must assume at-least-once delivery.

Handlers must therefore be idempotent.

---

# 8. API contracts

`packages/contracts` is the canonical internal client/server API contract.

Use:

- oRPC;
- Zod.

Contracts define:

- operation names;
- paths where applicable;
- request/input schemas;
- response/output schemas;
- expected error shapes where part of the public contract.

Client and server compile against the same contract.

Do not share Prisma models with the frontend.

Database representation and API representation are separate concerns.

OpenAPI is a derived output for:

- documentation;
- inspection;
- future external API consumers.

Generated OpenAPI is not the canonical internal source.

---

# 9. Data layer

Use:

- PostgreSQL;
- Prisma.

`packages/database` owns:

- Prisma schema/configuration;
- generated Prisma client;
- migrations;
- database bootstrap utilities;
- test database helpers;
- database-specific query helpers that are genuinely shared.

Feature repositories/data-access code may live close to the feature when feature-specific.

Do not turn `packages/database` into a giant repository containing every business query.

PostgreSQL hosting may initially be Supabase and later move to providers such as Azure Database for PostgreSQL without changing the domain architecture.

Provider movement should primarily require configuration, networking, pooling, backup and operational changes rather than application rewrites.

---

# 10. Supabase usage

Initial Supabase responsibilities:

- PostgreSQL hosting/local development;
- authentication;
- object storage;
- queues.

Supabase is an infrastructure provider, not the UniMate application architecture.

The Expo application must not query UniMate domain tables directly through Supabase's Data API.

Normal domain-data flow is:

```text
Expo
→ typed oRPC client
→ NestJS API
→ application logic
→ Prisma
→ PostgreSQL
```

Provider-specific Supabase code belongs only in appropriate adapters/bootstrap locations.

---

# 11. Authentication

Authentication initially uses Supabase Auth. Phase 5 established its seam
through `AccessTokenVerifier`, the Supabase asymmetric-JWT adapter, a
provider-neutral verified identity, `AuthIdentity` to UniMate `User` mapping,
and the mobile Auth adapter. Treat these existing pieces as the identity-provider
abstraction. Phase 7 should review them, not create a second `IdentityProvider`
or `SupabaseIdentityProvider`; extend the seam only if a real missing operation
emerges.

Feature code should consume provider-neutral identity/session concepts. The
provider implementation may use Supabase-specific SDKs.

The architecture must distinguish:

- external authentication identity;
- UniMate User;
- University affiliation/verification;
- organisation membership;
- application authorisation.

Conceptually:

```text
External identity
       ↓
AuthIdentity
       ↓
UniMate User
```

Do not make every UniMate foreign key depend directly on the authentication provider's user identifier.

---

# 12. Authorisation

Authorisation is layered.

## 12.1 Capability catalogue

Implemented capabilities are defined by application code.

Examples later may include:

```text
society.event.create
society.member.manage
society.finance.view
fixture.team.publish
event.response.remind
```

Do not allow arbitrary capability strings to be created through admin UI.

A capability only exists when code implements its meaning.

## 12.2 Roles

Human-friendly roles may be database-defined bundles of capabilities.

Examples may eventually include:

- President;
- Finance Officer;
- Committee Admin;
- Captain;
- Subgroup Admin.

Role names and capability mappings may change without changing route code.

## 12.3 Assignments

Role/capability assignments are scoped to the appropriate organisational/resource context.

The final relational model for Society/Subgroup scoped assignments must wait for the approved domain-model implementation rather than using weak generic polymorphic identifiers prematurely.

## 12.4 Policies

Resource-specific checks belong in policy/application logic.

For example:

A route-level capability may establish that the actor can generally update Events.

A resource policy must still determine whether the actor can update this particular Event.

## 12.5 Deny by default

Every API operation must declare an access posture:

- Public;
- Authenticated;
- Authorised/capability protected.

Routes without an explicit posture should fail architecture validation.

---

# 13. HTTP request flow

Conceptually:

```text
request
  ↓
request/correlation middleware
  ↓
authentication guard
  ↓
authorisation guard where required
  ↓
contract validation
  ↓
transport/controller adapter
  ↓
application service/use case
  ↓
resource-policy assertions
  ↓
repository/data access
  ↓
Prisma
  ↓
PostgreSQL
```

Responsibilities should remain distinct.

Middleware is for request-level cross-cutting concerns.

Guards are for authentication/coarse authorisation.

Resource-level business authorisation belongs deeper than transport guards.

---

# 14. Provider architecture

Where realistic provider replacement is required, use a narrow port.

Examples for remaining provider work:

```text
ObjectStorage
JobQueue
PushProvider
TelemetryProvider
```

The Phase 7 provider work concerns genuinely unimplemented seams: object
storage, job queue, push, and telemetry. Email is deferred until it is required.
Initial implementations may include:

```text
SupabaseObjectStorage
SupabaseJobQueue
ExpoPushProvider
```

Feature code consumes the port.

Provider implementation packages consume the SDK.

Do not expose provider-specific types across the port boundary.

Ports should represent what UniMate needs, not mirror the provider SDK.

---

# 15. Object storage

The database stores provider-neutral object identity and metadata.

Do not treat a provider URL as the permanent identity of an uploaded object.

Typical flow:

```text
Expo
→ API asks permission to upload
→ API checks permission
→ storage adapter creates scoped upload authorisation
→ Expo uploads directly to storage provider
→ application records provider-neutral object metadata
```

Avoid proxying large file bytes through NestJS unless a specific workflow requires server-side transformation.

---

# 16. Queueing and background work

Use a `JobQueue` abstraction.

Initial provider:

- Supabase Queues.

Job payloads must:

- be versioned;
- be Zod validated;
- contain stable identifiers rather than unnecessary object snapshots;
- avoid sensitive information unless required.

Consumers must be idempotent.

Retries must distinguish transient from permanent failures.

Dead-letter handling must exist before consequential jobs depend on the queue.

---

# 17. Transactional outbox

When a database mutation must reliably cause asynchronous work, do not:

1. commit the database mutation;
2. independently enqueue a message;
3. hope both succeed.

Instead write an Outbox record in the same database transaction.

Conceptually:

```text
DB transaction
├── business mutation
└── outbox record
        ↓
outbox dispatcher
        ↓
JobQueue
        ↓
worker
```

This eliminates the commit/enqueue race.

Phase 9 proves this mechanism with one foundation-only task. Delivery remains
at least once: the dispatcher may publish the same stable Outbox-derived job
again if queue acceptance succeeds but the database transaction does not
commit. Handlers must therefore be idempotent. See
[`BACKGROUND_JOBS.md`](./BACKGROUND_JOBS.md) for the implementation contract.

---

# 18. Push notifications

Use a provider-neutral push interface. `PushProvider` sends to one opaque
destination and checks the opaque submission handle for a provider-neutral
`accepted` or `pending` receipt result. Expo Push Service is the initial
provider. A receipt accepted by APNs/FCM is not proof that a person saw the
notification.

Device registrations and minimal transport delivery attempts are separate
from in-app Notification domain data. The Phase 10 foundation send job carries
only a registration ID; its receipt-check job carries only a delivery-attempt
ID. Persist successful submission handles to prevent ordinary redelivery from
resending, while documenting the narrow external-acceptance-before-persistence
duplicate window. Never claim exactly-once push delivery.

"Push notification" and "in-app Notification" are separate concerns. Later
UniMate Notification records will represent application attention/history.

---

# 19. Configuration

Use typed configuration.

Environment variables are untrusted input and must be validated at process startup.

Separate:

- public Expo configuration;
- server secrets;
- environment-specific infrastructure settings.

Never expose server secrets through Expo public environment variables.

Applications should fail clearly at startup when required configuration is invalid.

---

# 20. Error model

Define one stable application/API error shape.

Do not expose:

- raw database errors;
- Prisma internals;
- provider errors;
- stack traces;

to clients.

Domain/application errors should map predictably to transport responses.

Inside oRPC procedure handlers, use `ORPCError` for expected client errors;
Nest `HttpException`s thrown by the handler become unexpected RPC failures.
Nest exceptions remain appropriate for guards that run before the handler.

Unexpected failures should be logged with correlation context.

---

# 21. Observability

Build observability in from the foundation.

Required concepts:

- structured logs;
- request IDs;
- correlation IDs;
- job IDs;
- trace context;
- database query timing where practical;
- provider-operation timing;
- error reporting.

Prefer OpenTelemetry-compatible instrumentation so the observability backend can change.

A request that schedules asynchronous work should be traceable across:

```text
mobile
→ API
→ database
→ outbox
→ queue
→ worker
→ external provider
```

---

# 22. Testing architecture

Use multiple levels.

## Unit tests

For isolated business logic and policies.

## Contract tests

Ensure client/server implementations remain compatible with canonical contracts.

## Integration tests

Use real PostgreSQL for database-sensitive behaviour.

Avoid replacing PostgreSQL with SQLite for integration tests.

## API tests

Exercise the running Nest application against realistic infrastructure.

## Browser E2E

Use Playwright for durable web flows.

The VS Code integrated browser may be used for exploratory agent validation.

## Native E2E/exploratory verification

Use `agent-device` against local iOS Simulator/Android Emulator for agent-driven verification.

A later native E2E framework may be added if durable automated flows require it.

---

# 23. Native runtime strategy

Native dependency changes require native rebuilds.

To reduce unnecessary EAS builds:

- pre-install high-confidence native dependencies during foundation setup;
- use local iOS/Android builds for routine development;
- use Expo-compatible dependency installation;
- maintain a documented native-runtime dependency inventory;
- use runtime/fingerprint compatibility mechanisms where appropriate;
- do not add speculative native dependencies casually.

JavaScript/TypeScript-only changes should normally reuse the existing development client.

---

# 24. Agent-first architecture

The repository should make correct behaviour easier than incorrect behaviour.

Important architecture constraints should eventually be mechanically enforced.

Examples:

- mobile cannot import database;
- contracts cannot import NestJS;
- contracts cannot import Prisma;
- feature code cannot import Supabase provider SDKs;
- provider SDK imports are restricted to provider adapters/bootstrap;
- cross-feature internals cannot be imported directly;
- every API operation declares access posture.

Lint/test errors should explain how to correct the violation.

The repository documentation is the system of record.

`AGENTS.md` is only the entry map.

---

# 25. Future design system

Do not create the final UI/design-system package until the UniMate representative visual-validation process reaches Phase 12B.

Foundation UI should remain deliberately replaceable.

Once validated, Phase 12B will introduce the real:

- semantic tokens;
- UI primitives;
- reusable components;
- interaction patterns;
- visual system.

Do not allow temporary foundation styling to become accidental product design.

---

# 26. Architectural change policy

A change is architectural when it alters:

- package dependency direction;
- canonical contract strategy;
- database technology;
- authorisation model;
- provider boundary;
- queue/outbox strategy;
- major repository structure;
- testing philosophy.

Architectural changes require:

1. explicit rationale;
2. alternatives considered;
3. documentation update;
4. migration impact where applicable.

Do not make architectural changes silently while implementing an unrelated feature.
