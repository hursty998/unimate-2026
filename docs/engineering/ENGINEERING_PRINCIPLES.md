# UniMate Engineering Principles

## Purpose

These principles define how UniMate code should be written and reviewed.

They exist to make a large codebase:

- understandable;
- performant;
- secure;
- maintainable;
- friendly to coding agents;
- difficult to corrupt accidentally.

When a principle conflicts with a genuine product requirement, resolve the conflict deliberately rather than silently bypassing the principle.

---

# 1. Prefer explicitness over magic

Code should make ownership, data flow and side effects understandable.

Avoid abstractions whose main benefit is reducing a few lines of code.

A future engineer or coding agent should be able to identify:

- where data comes from;
- where validation occurs;
- where permission is checked;
- what writes are performed;
- what asynchronous work follows.

---

# 2. Design around stable boundaries

The main boundaries are:

- UI;
- API contract;
- application/use case;
- authorisation policy;
- persistence;
- infrastructure provider.

Do not collapse them merely because a feature is initially small.

At the same time, do not introduce interfaces/layers with no realistic purpose.

---

# 3. Organise vertically by business concept

Prefer:

```text
modules/events/
modules/users/
modules/notifications/
```

over:

```text
controllers/
services/
repositories/
```

for the whole application.

A feature may contain its own controller, service, repository and tests internally.

This keeps related code together.

---

# 4. Keep files focused

Large files are harder for both people and agents to reason about.

Split files when they contain multiple unrelated responsibilities.

Do not split merely to satisfy an arbitrary line-count rule.

Prefer meaningful concepts over tiny fragments.

---

# 5. Maintain explicit public APIs

Packages and business modules should expose intentional entry points.

Do not import arbitrary internal files from another module.

Prefer:

```text
@unimate/contracts
```

or an explicit feature public export.

Avoid deep imports into implementation internals.

---

# 6. Strict TypeScript

Use TypeScript strict mode.

Avoid `any`.

When input type is unknown, use `unknown` and validate/refine it.

Avoid type assertions that merely silence the compiler.

An assertion should represent something the program has actually established.

---

# 7. Validate every untrusted boundary

Use Zod or the relevant canonical schema at external boundaries.

Examples:

- HTTP input;
- route parameters;
- environment variables;
- queue payloads;
- webhook payloads;
- deep-link parameters;
- provider callbacks;
- persisted schemaless metadata where applicable.

Internal code should not repeatedly revalidate values already established by a trusted boundary unless another trust boundary is crossed.

---

# 8. Contracts first

API changes begin in `packages/contracts`.

Client and server compile against the same semantic contract.

Do not manually maintain duplicated request/response DTO definitions.

Do not expose Prisma types as API contracts.

Database shape and API shape may evolve independently.

---

# 9. Generate repetitive artefacts

Humans and agents edit semantic source files.

Machines generate repetitive derivatives.

Good generated outputs include:

- Prisma Client;
- OpenAPI;
- derived documentation;
- generated schemas/metadata where appropriate.

Generated files must be clearly identified.

Never require an agent to edit both canonical and generated copies manually.

---

# 10. PostgreSQL is relational

Core business data should use relational structures.

Do not use JSON/JSONB for data that regularly participates in:

- filtering;
- sorting;
- joining;
- uniqueness;
- foreign-key relationships;
- permissions;
- reporting.

Avoid arrays of IDs where a relationship table is appropriate.

Use JSONB for genuinely schemaless or opaque data such as:

- provider metadata;
- immutable snapshots;
- externally defined payload fragments;
- rarely queried flexible metadata.

If a JSON property becomes operationally important, promote it to a proper relational column/table.

---

# 11. Preserve database integrity

Use:

- foreign keys;
- unique constraints;
- check constraints where valuable;
- appropriate nullability;
- database transactions.

Do not rely only on application code to enforce important invariants.

---

# 12. Index for actual query shapes

Indexes must follow real access patterns.

Do not add indexes blindly to every column.

Consider:

- equality filters;
- range filters;
- sort order;
- tenancy/context scoping;
- pagination;
- partial populations.

Typical high-volume timeline indexes may resemble:

```text
(context_id, created_at DESC, id DESC)
```

but exact indexes must follow the actual query.

Review important queries with PostgreSQL execution plans when performance matters.

---

# 13. Foreign-key indexes are deliberate

Do not assume every useful foreign-key index exists automatically.

Add indexes where parent-to-child lookup patterns require them.

Avoid redundant indexes that duplicate an existing useful prefix.

---

# 14. Avoid N+1 access

Do not query one related record per list row.

Use:

- relational queries;
- batching;
- joins;
- deliberate preloading;
- appropriately shaped read queries.

Tests/reviews should inspect query counts for critical list endpoints where useful.

---

# 15. Select only what is needed

Do not habitually fetch complete database records.

Use Prisma `select`/appropriate projections to retrieve fields required by the use case.

This is especially important for:

- Activity;
- member directories;
- Notifications;
- Events;
- feeds;
- reporting.

---

# 16. Lists are bounded

Every potentially growing list endpoint must be bounded.

Do not expose unbounded:

- Activity;
- Comments;
- members;
- Events;
- Notifications;
- transactions.

Use pagination.

Prefer cursor/keyset pagination for large chronological datasets.

Offset pagination is acceptable for small/admin datasets where its trade-offs are understood.

---

# 17. Stable ordering

Paginated queries require deterministic ordering.

Use a stable tiebreaker, commonly:

```text
createdAt
id
```

Do not paginate only by a non-unique timestamp.

---

# 18. Use UUIDv7 or another sortable globally unique identifier

Domain identifiers should be safe to create independently and perform sensibly in indexed storage.

Use the repository's chosen UUIDv7 implementation consistently once selected.

Do not expose sequential database IDs where avoidable.

---

# 19. Time is explicit

Persist absolute instants using timezone-aware PostgreSQL timestamps.

Use UTC operationally.

Store an IANA timezone when future/local calendar interpretation depends on it.

Do not store ambiguous local date-time strings as instants.

Recurring-event modelling must preserve the relevant local timezone.

---

# 20. Money uses integer minor units

Never store money as floating point.

Store:

- integer minor units;
- ISO currency code.

For example:

```text
3500 GBP
```

means £35.00.

---

# 21. Durable state is explicit

Avoid clusters of booleans representing lifecycle state.

Prefer explicit enums/state machines where an object has meaningful lifecycle states.

Validate legal transitions in application/domain logic.

---

# 22. Do not soft-delete everything automatically

Use soft deletion where:

- recovery matters;
- audit semantics require it;
- related product behaviour expects restoration/history.

Otherwise use normal deletion with appropriate audit/event handling.

Soft-deleted data still consumes indexes and complicates every query.

---

# 23. Transactions protect invariants

Writes that must succeed or fail together belong in one transaction.

Do not create partially updated consequential state.

Keep transactions short.

Do not perform long external network calls while holding a database transaction open.

---

# 24. Handle concurrency deliberately

Where concurrent updates could cause meaningful lost state, use an explicit strategy such as:

- optimistic concurrency/version checks;
- database constraints;
- appropriate locking;
- idempotency.

Do not assume UI sequencing prevents concurrent writes.

---

# 25. Idempotency for consequential side effects

Operations that may be retried must have safe duplicate handling.

Examples:

- payment callbacks;
- ticket issuance;
- webhook processing;
- reminder delivery;
- queue jobs;
- external provider callbacks.

Idempotency belongs at the layer that owns the side effect.

---

# 26. Use the transactional outbox for reliable async consequences

When a committed business change must cause background work, write an outbox record in the same transaction.

A dispatcher then delivers it to the queue.

Do not rely on:

```text
await db.commit()
await queue.send()
```

for consequential work without recovery semantics.

---

# 27. Queue handlers assume duplicate delivery

Queue delivery should be treated as at-least-once.

Handlers must be idempotent.

Every job schema is versioned.

Validate payloads before execution.

Do not put unnecessary large snapshots in queue messages.

Prefer stable IDs and reload authoritative state when appropriate.

---

# 28. Retry intelligently

Retry transient failures.

Do not retry permanent errors endlessly.

Define:

- maximum attempts;
- backoff;
- dead-letter behaviour;
- observability.

Avoid retry storms.

---

# 29. Provider code stays at provider boundaries

Feature code must not import infrastructure SDKs directly.

Examples of imports that should eventually be architecture-restricted:

- Supabase SDK outside Supabase adapters/bootstrap;
- Expo Push implementation outside notification provider;
- provider-specific storage libraries outside storage provider.

Provider ports should describe UniMate needs, not copy the provider SDK's API.

---

# 30. Store provider-neutral storage identity

Persist an object key/identifier and relevant metadata.

Do not make a temporary/public provider URL the canonical identity of uploaded content.

Generate or resolve URLs through the storage layer according to visibility/access policy.

---

# 31. Authentication is not authorisation

Authentication establishes identity.

Do not infer:

- University verification;
- Society membership;
- Subgroup membership;
- committee role;
- finance access;

from authentication alone.

All consequential backend operations must independently enforce authorisation.

---

# 32. Capabilities are code-defined

The application defines the set of implemented capabilities.

Human-readable roles may map onto them dynamically.

Do not scatter checks such as:

```text
role === "ADMIN"
```

through business code.

Prefer semantic capability/policy checks.

---

# 33. Resource policies handle resource-specific rules

Route-level guards provide coarse access control.

Resource-specific rules belong in application/policy logic.

For example:

```text
actor has event.update
```

is not necessarily enough to edit every Event.

Check the actual resource/context.

---

# 34. Deny protected access by default

Every API operation must explicitly declare its intended access posture.

Do not assume newly added endpoints are safe simply because a controller is usually protected.

Architecture tests should eventually detect missing posture declarations.

---

# 35. Middleware is not the RBAC engine

Use middleware for generic request concerns such as:

- request/correlation IDs;
- safe request metadata;
- generic transport setup.

Use guards for authentication and coarse authorisation.

Use policies/application logic for resource-specific authorisation.

Use interceptors for cross-cutting timing/tracing/response concerns.

Use exception filters for stable transport error mapping.

---

# 36. Controllers are thin

Controllers/transport handlers should:

- receive validated input;
- establish actor/context;
- invoke the relevant application operation;
- map results where necessary.

They should not contain multi-step business workflows.

---

# 37. Use cases expose meaningful operations

Prefer methods representing user/business actions.

Examples:

```text
requestTrainingAvailability()
publishTeamSheet()
approveMembership()
```

rather than giant generic CRUD services where domain behaviour is lost.

CRUD is fine when the concept really is CRUD.

---

# 38. Server state belongs to TanStack Query on the client

Do not unnecessarily copy server state into another global state store.

Use TanStack Query for:

- fetching;
- caching;
- invalidation;
- mutations;
- optimistic state where safe.

Use local/component state for transient UI state.

Introduce another global client-state library only when a real need appears.

---

# 39. Route files stay thin

Expo Router route files should not become feature implementations.

They should compose feature screens and navigation.

Business/server-data hooks belong under feature code.

---

# 40. Components represent concepts

Prefer components such as:

```text
EventCard
CommentPreview
MemberRow
```

rather than style-specific names such as:

```text
RoundedGreyBox2
```

The final UniMate component language will be derived from approved Phase 12B visual design.

Foundation components should remain minimal.

---

# 41. Accessibility is functional correctness

Do not treat accessibility as optional polish.

For interactive UI consider:

- semantic roles;
- labels;
- state;
- focus;
- touch targets;
- text scaling;
- keyboard/web navigation;
- reduced motion.

Prefer selectors that are both accessible to users and useful to automated tests.

---

# 42. Logging is structured

Do not rely on ad hoc `console.log` as production observability.

Logs should be machine-readable and carry relevant context such as:

- request ID;
- trace ID;
- actor/user ID where appropriate;
- job ID;
- operation;
- outcome.

Never log secrets or unnecessarily sensitive data.

---

# 43. Errors are actionable

Error messages intended for developers/agents should include enough context to diagnose the failure.

Architecture lint messages should ideally explain the permitted alternative.

User-facing errors should be understandable without leaking internals.

---

# 44. Measure before denormalising

Do not denormalise because a query "might be slow".

Start with a correct relational model.

Measure.

Use query plans and telemetry.

Then introduce:

- derived columns;
- read models;
- caches;
- materialised views;

when evidence justifies them.

Document how derived data remains consistent.

---

# 45. Cache deliberately

Caching is not a substitute for correct indexing/query design.

Every cache requires:

- ownership;
- invalidation semantics;
- expiry semantics;
- failure behaviour.

Do not introduce distributed caching infrastructure until justified.

---

# 46. Avoid premature microservices

Keep the application as a modular monolith plus worker initially.

Package/module boundaries should make later extraction possible where justified.

Do not create network boundaries simply for organisational neatness.

---

# 47. Keep the hot path simple

Common request flows should not pass through unnecessary abstraction or multiple network services.

Optimise for correctness and understandable performance first.

---

# 48. Test behaviour, not implementation trivia

Tests should primarily protect:

- contracts;
- business outcomes;
- permissions;
- state transitions;
- integration behaviour;
- regression-prone logic.

Avoid tests that break merely because internal function structure was refactored without behaviour changing.

---

# 49. Use real PostgreSQL for database integration tests

Do not claim PostgreSQL behaviour is verified by SQLite.

Use isolated real PostgreSQL test databases/schemas.

Migrations must be tested from a clean state.

---

# 50. Keep deterministic fixtures

Agent/browser/device validation needs repeatable data.

Seed known deterministic users/states.

Do not rely on manually prepared local accounts.

Never use production user data as test fixtures.

---

# 51. Browser and device verification complement tests

A passing TypeScript build does not prove the UI works.

For important UI work:

- run web/browser flows;
- run native Simulator/emulator flows;
- inspect logs/errors;
- capture evidence where useful.

Commit durable Playwright tests for important browser behaviour.

Use agent-device for agent-driven native verification.

---

# 52. Make the feedback loop cheap

The repository should expose:

```text
pnpm verify:changed
```

for fast affected verification and:

```text
pnpm verify
```

for the comprehensive suite.

Agents should repair failures they introduce and rerun verification.

Do not require agents to memorise many unrelated commands.

---

# 53. Enforce architecture mechanically

Important boundaries should be linted/tested.

Documentation alone is insufficient.

Examples:

- mobile importing Prisma should fail;
- contracts importing NestJS should fail;
- feature code importing Supabase directly should fail;
- unclassified API access posture should fail.

Mechanical enforcement allows simpler coding agents to work more safely.

---

# 54. Prefer local verification before cloud resources

Use:

- local PostgreSQL/Supabase;
- local iOS Simulator;
- local Android emulator;
- local browser;
- local native development builds;

where practical.

Do not burn EAS builds merely to test JavaScript/TypeScript changes.

---

# 55. Treat native dependencies deliberately

Adding a React Native/Expo native dependency can change the native runtime.

Before adding one:

1. verify it is genuinely required;
2. check whether an existing installed capability solves the problem;
3. use Expo-compatible installation;
4. update native-runtime documentation;
5. state whether a new development build is required.

---

# 56. Version upgrades are deliberate

Use stable releases by default.

Pin direct dependencies according to repository policy and commit the lockfile.

Do not casually upgrade framework majors as part of an unrelated feature.

Framework-major upgrades should have:

- dedicated change/PR;
- migration review;
- full verification.

---

# 57. Keep documentation close to reality

Architecture documents are part of the codebase.

When behaviour or boundaries change, update documentation in the same work.

Do not preserve obsolete documentation merely for history unless it is explicitly marked historical.

---

# 58. Agent instructions should remain small

Do not expand root `AGENTS.md` into an encyclopedia.

Put deeper guidance here or in focused docs/skills.

Use nested `AGENTS.md` only where a subtree has genuinely different constraints.

Use skills for specialised procedures rather than permanent global context.

---

# 59. Skills should teach non-obvious workflows

Good custom skills include:

- changing an API contract;
- creating a migration;
- adding an authorised operation;
- adding a queue job;
- debugging a full-stack flow;
- verifying a mobile flow.

Do not create a skill merely to restate basic framework documentation.

Prefer official vendor skills for fast-changing framework-specific guidance.

---

# 60. Review the diff before declaring completion

Every agent should inspect the resulting diff.

Look for:

- accidental generated changes;
- unused dependencies;
- debug code;
- duplicated abstractions;
- architectural boundary violations;
- unnecessary scope expansion.

The smallest correct coherent change is preferred.
