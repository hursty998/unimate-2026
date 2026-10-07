# UniMate Foundation Implementation Plan

## Purpose

Build a production-grade engineering foundation before implementing substantial UniMate product features.

The goal is not to build the full UniMate domain yet.

The goal is to prove that the repository, tooling, infrastructure seams, authentication, typed API, persistence, background jobs and agent verification loop work end to end.

---

# Completion definition

The foundation is complete when a clean checkout can reproducibly:

1. install dependencies;
2. start local Supabase;
3. initialise/migrate PostgreSQL;
4. start the Expo app;
5. start the NestJS API;
6. start the worker;
7. authenticate a user;
8. resolve that identity to a UniMate User;
9. execute a typed client → API → Prisma → PostgreSQL request;
10. perform a signed/direct storage upload;
11. create reliable asynchronous work through outbox + queue;
12. consume the work in the worker;
13. send a test Expo push notification;
14. produce correlated structured logs/traces;
15. pass fast verification;
16. pass full verification;
17. run on web;
18. run on local iOS Simulator;
19. run on Android emulator;
20. run as an EAS development build on a physical phone.

Do not implement substantial Society/Event/Fixture domain functionality merely to satisfy this plan.

---

# Phase 0 - Agent and machine preparation

## Goal

Ensure the local environment and agent knowledge are ready before code generation.

## Work

Verify:

- Node;
- npm;
- pnpm;
- Git;
- Docker;
- Supabase CLI;
- Xcode;
- Xcode Command Line Tools;
- iOS Simulator/runtime;
- Android Studio;
- Android SDK;
- `adb`;
- Java/JDK;
- Watchman where appropriate;
- EAS CLI;
- agent-device.

Install selected official agent skills for:

- Expo;
- Supabase;
- PostgreSQL best practices;
- Prisma;
- Turborepo;
- device/simulator workflows.

Prefer project-local skills where supported.

Do not scaffold product code in this phase.

## Acceptance

Produce an environment report showing:

- detected versions;
- installed tools;
- skills installed;
- missing/manual actions;
- any incompatibilities.

Stop if a critical prerequisite requires human action.

---

# Phase 1 - Monorepo scaffold

## Goal

Create the workspace and deterministic development tooling.

## Structure

Create:

```text
apps/mobile
apps/api
apps/worker

packages/contracts
packages/database
packages/auth
packages/storage
packages/queue
packages/notifications
packages/observability
packages/config
packages/testing
packages/eslint-config
packages/typescript-config
```

Create:

```text
docs/exec-plans/active
docs/exec-plans/completed
docs/generated
```

## Tooling

Configure:

- pnpm workspace;
- Turborepo;
- strict TypeScript;
- linting;
- formatting;
- shared configuration;
- exact/direct dependency version policy;
- lockfile;
- `.node-version` or equivalent;
- environment examples.

Add root scripts for:

```text
dev
build
lint
typecheck
test
verify:changed
verify
```

At this stage, scripts may initially compose smaller checks and become richer in later phases.

## Acceptance

- clean install succeeds;
- Turbo detects all workspaces;
- lint/typecheck/build scaffolds are green;
- no product functionality is required.

---

# Phase 2 - Expo foundation and native capability envelope

## Goal

Create one Expo Router app for iOS, Android and web and establish the native runtime likely to be required by UniMate.

## Work

Create Expo app using current stable compatible Expo tooling.

Use Expo-compatible installation for SDK packages.

Install high-confidence native capabilities expected by UniMate before establishing the long-lived development client.

Candidate capabilities include:

- development client;
- routing;
- push notifications;
- secure storage;
- images/media;
- image picker;
- document picker;
- file system;
- camera/QR;
- haptics;
- device/application metadata;
- linking/deep links;
- web browser auth support;
- splash/system UI;
- fonts;
- local SQLite where useful;
- gesture handler;
- Reanimated;
- screens;
- safe areas;
- SVG;
- persistent async storage;
- Stripe React Native;
- Sentry React Native.

Do not install speculative libraries with no realistic foreseeable use.

Record every native dependency and why it is pre-baked in:

```text
docs/engineering/NATIVE_RUNTIME.md
```

## Validation

Run:

- web;
- local iOS Simulator build;
- local Android emulator build.

Use agent-device to inspect the native app.

Use VS Code browser tooling to inspect the web app.

## Acceptance

One minimal replaceable foundation screen renders successfully on all three platforms.

No final UniMate visual design is implemented.

---

# Phase 3 - API and contract foundation

## Goal

Prove contract-first communication.

## Work

Configure:

- NestJS;
- Fastify;
- oRPC;
- Zod;
- `packages/contracts`.

Create one trivial health/system contract and implementation.

Generate OpenAPI as a derived artefact if supported cleanly.

Create a typed client consumed by Expo.

## Acceptance

Expo web/native can call the API through the canonical shared contract.

Changing the contract should produce meaningful compile-time failures in mismatched consumers/implementations.

---

# Phase 4 - PostgreSQL and Prisma foundation

## Goal

Create the permanent relational persistence layer.

## Work

Configure:

- local Supabase PostgreSQL;
- Prisma;
- `packages/database`;
- migrations;
- generation;
- reset;
- seeding;
- integration-test database strategy.

Initial permanent domain tables should be limited to foundation identity concepts that are already stable enough, likely:

- User;
- AuthIdentity;
- University;
- UniversityAffiliation.

Add infrastructure tables required by the foundation such as:

- transactional outbox;
- provider/device registrations where appropriate.

Do not implement the full Society/Event schema yet.

## Acceptance

From an empty local environment:

- migrations apply successfully;
- deterministic seed succeeds;
- Prisma client generates;
- integration test writes/reads real PostgreSQL;
- reset can reproduce the same state.

---

# Phase 5 - Authentication vertical slice

## Goal

Prove external identity → UniMate User → typed authenticated API.

## Work

Implement provider-neutral authentication boundary.

Initial provider:

- Supabase Auth.

Expo:

- sign in;
- sign out;
- session persistence;
- token refresh;
- secure local handling.

API:

- verify identity token;
- map provider identity through AuthIdentity;
- resolve UniMate User.

Create canonical authenticated operation:

```text
getMe
```

through:

```text
Expo
→ oRPC
→ NestJS
→ Prisma
→ PostgreSQL
```

## Acceptance

A real authenticated user can sign in and retrieve the matching UniMate User on:

- web;
- iOS Simulator;
- Android emulator.

Tests cover invalid/expired/missing authentication.

---

# Phase 6 - Authorisation framework

## Goal

Build extensible authorisation plumbing without prematurely implementing final UniMate organisational RBAC.

## Work

Create:

- explicit access-posture metadata;
- authentication guard;
- coarse authorisation/capability guard;
- code-defined capability catalogue mechanism;
- AuthorisationService/policy boundary;
- resource-policy pattern;
- architecture test requiring every API operation to have declared access posture.

Do not prematurely create weak generic Society/Subgroup role-assignment tables before those domain entities exist.

Use synthetic/test capability assignment to prove the framework.

## Acceptance

Tests prove:

- Public endpoint works unauthenticated;
- Authenticated endpoint rejects anonymous actor;
- capability-protected operation rejects missing capability;
- permitted actor succeeds;
- resource policy can still reject an actor who has coarse capability;
- endpoint without access posture fails structural validation.

---

# Phase 7 - Provider seams

## Goal

Ensure replaceable infrastructure is isolated before product features begin using it.

## Work

Define narrow provider-neutral ports for:

- IdentityProvider;
- ObjectStorage;
- JobQueue;
- PushProvider;
- TelemetryProvider.

Add initial provider implementations:

- Supabase Auth;
- Supabase Storage;
- Supabase Queues;
- Expo Push;
- OpenTelemetry-compatible observability.

Provider SDK imports must be restricted mechanically where practical.

## Acceptance

Feature/application code can use each port without importing provider-specific types.

Architecture tests catch direct provider imports in forbidden areas.

---

# Phase 8 - Storage proof

## Goal

Prove scalable file-upload architecture.

## Work

Implement a test upload flow:

1. authenticated client requests upload authorisation;
2. API performs permission check;
3. ObjectStorage creates scoped/signed upload capability;
4. client uploads directly to provider;
5. application records provider-neutral metadata;
6. authorised retrieval works.

Use test data, not a full UniMate media domain.

## Acceptance

Works from:

- web;
- iOS Simulator;
- Android emulator.

No large upload bytes need to pass through NestJS.

---

# Phase 9 - Outbox, queue and worker

## Goal

Prove reliable asynchronous execution.

## Work

Implement:

- transactional Outbox table;
- outbox dispatcher;
- JobQueue abstraction;
- Supabase Queue implementation;
- worker consumption;
- job schema versioning;
- Zod validation;
- idempotency;
- retries;
- dead-letter/error handling;
- observability.

Create one harmless foundation job.

## Acceptance

A database transaction can create business/test state and an Outbox record atomically.

Dispatcher safely publishes.

Worker consumes.

Duplicate delivery does not duplicate the side effect.

Failure/retry path is testable.

---

# Phase 10 - Push notifications

## Goal

Prove worker → Expo Push → physical device.

## Work

Implement:

- device push-token registration;
- provider-neutral PushProvider;
- Expo Push implementation;
- worker push job;
- stale/invalid token handling.

Do not build the full UniMate Notification domain yet.

## Acceptance

A test push reaches a real development-build device.

Simulator behaviour may be tested where supported, but physical-device proof is required for foundation completion.

---

# Phase 11 - Observability

## Goal

Make the system legible to people and agents.

## Work

Implement:

- structured logging;
- request/correlation IDs;
- job IDs;
- error reporting seam;
- OpenTelemetry-compatible traces;
- query-duration visibility where practical;
- health/readiness endpoints.

Correlate asynchronous work back to originating request/outbox where possible.

## Acceptance

A test request that causes a queued job can be followed through logs/traces across API and worker.

No secrets appear in logs.

---

# Phase 12 - Agent verification harness

## Goal

Make implementation failures machine-readable and cheap to repair.

## Work

Finish:

```text
pnpm verify:changed
pnpm verify
```

Fast verification should include relevant:

- formatting;
- lint;
- architecture checks;
- typecheck;
- unit tests;
- contract checks.

Full verification should additionally include:

- clean database migration/reset check;
- integration tests;
- API tests;
- queue/outbox tests;
- web Playwright smoke test;
- native/build validation where practical.

Add architecture restrictions with actionable error messages.

Add deterministic seed/test accounts.

## Acceptance

An agent can make a small change, run one command, receive useful failures, repair them and reach green.

---

# Phase 13 - Browser and native smoke flows

## Goal

Prove agent-observable end-to-end behaviour.

## Browser

Use:

- VS Code integrated browser for exploratory agent verification;
- Playwright for committed durable smoke flows.

Smoke flow:

- open app;
- sign in;
- call authenticated API;
- render user identity;
- test sign out.

## Native

Use:

- agent-device;
- local iOS Simulator;
- local Android emulator.

Run equivalent smoke flow.

Capture screenshots/artifacts on failure where useful.

## Acceptance

The agent can autonomously inspect and operate both web and native foundation apps.

---

# Phase 14 - EAS development workflow

## Goal

Create efficient native development distribution.

## Work

Configure:

- EAS project;
- development profile;
- preview profile;
- production profile;
- runtime/fingerprint strategy;
- EAS Update where appropriate;
- build reuse/caching where appropriate.

Create:

- local iOS development build;
- local Android development build where practical;
- cloud development build for real device.

Avoid unnecessary cloud builds.

## Acceptance

Physical iPhone runs development client.

Normal TypeScript/JavaScript changes can be loaded without rebuilding native runtime.

Native-runtime changes are documented and detectable.

---

# Phase 15 - CI

## Goal

Reproduce local quality gates remotely.

## Work

Configure GitHub Actions for:

- install;
- lint;
- architecture checks;
- typecheck;
- tests;
- database migration verification;
- build checks;
- relevant generated-file consistency.

Do not trigger expensive EAS builds for every commit by default.

## Acceptance

A pull request cannot merge with failed mandatory foundation verification.

---

# Phase 16 - Foundation completion

## Final checks

From a clean checkout prove:

```text
install
local infrastructure
database migrate
seed
API start
worker start
Expo start
web
iOS Simulator
Android emulator
authentication
getMe
storage test
outbox
queue
worker
push
observability
verify
CI
```

Document known limitations.

Move active implementation plan to completed.

Create a Git tag such as:

```text
foundation-v1
```

only once all agreed acceptance criteria pass.

Then begin deliberate UniMate domain implementation.
