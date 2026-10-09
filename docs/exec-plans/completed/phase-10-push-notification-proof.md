# Phase 10 — Push Notification Proof

## Scope and baseline

Prove authenticated mobile registration → Nest API → transactional outbox →
PGMQ → worker → Expo Push → a physical development-build device. This is
transport infrastructure only; it does not introduce the UniMate Notification
domain.

The implementation starts from clean `development` HEAD `fa018ab`
(`feat(worker): enhance job processing with registry and outbox dispatch
improvements`), with the Phase 9 worker hardening committed. Local Supabase and
PostgreSQL are running, and the five committed baseline Prisma migrations were
applied before Phase 10.
Existing migrations are immutable.

Expo SDK 57 already includes `expo-notifications`, `expo-device`, and
`expo-constants`; the notifications plugin, EAS project ID, and physical-device
development profile are configured. EAS cloud build history is empty. The
connected iPhone 17 is registered and Developer Mode is enabled. No compatible
build was installed at the start of physical acceptance, so a local internal
development build was selected.

The owner authenticated to Apple through EAS, and one APNs push key was
created and assigned to the original `com.unimate.app` identifier. Apple
confirmed that identifier is not registered to the existing Apple team. The
owner explicitly approved changing only the iOS
bundle identifier, trying `com.unimate.ios` first, then
`com.unimate2026.ios`, then `app.unimate2026.mobile`. The existing APNs key
must be reused; do not create another team or delete existing Apple resources.
Apple confirmed `com.unimate.ios` was available; EAS registered it and enabled
the push capability. The registered iPhone 17 appears in the active ad-hoc
provisioning profile. The existing distribution certificate and APNs key were
reused.

For development networking, the Mac and online iPhone were verified on the
same active Tailscale identity; no account switch was needed. Tailscale Serve
(not Funnel) now exposes only:

- private HTTPS `/` on port 443 → loopback API `127.0.0.1:3000`;
- private HTTPS `/` on port 8443 → loopback Supabase gateway
  `127.0.0.1:55321`.
- private HTTPS `/` on port 8081 → loopback Metro `127.0.0.1:8081`.

No PostgreSQL/PGMQ ports are exposed. Ignored `apps/mobile/.env` points the
physical client at the HTTPS API and Supabase origins, while the API and worker
retain their local loopback/database connections. Private HTTPS Auth and API
calls were verified from the Mac via its Tailscale address; signed-storage
capability rewriting accepts only the approved loopback, Android emulator, or
private `.ts.net:8443` Supabase origins. Metro is separate and uses its own
tailnet-only HTTPS Serve listener on port 8081.

## Decisions

- Extend the existing `PushProvider` and `ExpoPushProvider`; receipt results
  expose only `accepted` or `pending`. Expo receipt error details remain inside
  the adapter and become the existing provider-neutral invalid-token,
  transient, or rejected failures.
- Persist Expo registrations per physical destination, not per User. A partial
  unique index permits one active Expo destination globally while retaining
  disabled history. Re-registering the same active token for its current owner
  is idempotent. A token registered by another authenticated account transfers
  ownership transactionally by disabling the previous row and creating a new
  registration ID; old queued jobs then target the disabled ID and no-op.
- Persist only the successful submission handle and minimal transport state in
  `PushDeliveryAttempt`, uniquely keyed by source send-job ID. User deletion
  cascades through registrations and their delivery attempts.
- Create the send outbox row in the same transaction as the active,
  caller-owned registration check. Send and receipt queue payloads contain only
  their stable registration or attempt IDs.
- Receipt checking uses the existing durable queue with a provider-neutral
  `delaySeconds` enqueue option; its default for receipt work is Expo's
  recommended 15 minutes. Unit tests inject a short delay. PGMQ-specific
  arguments stay inside the Supabase queue adapter.
- Persisting a successful provider submission prevents normal redelivery from
  resending and allows receipt scheduling to be repaired. A crash after Expo
  accepts but before the handle is committed can still cause a duplicate; push
  is at-least-once, not exactly-once.
- Keep registration available to authenticated clients, but compose the
  synthetic proof route only outside production. Foundation proof UI and
  permission prompting are development-only and user-initiated.
- Reuse the configured EAS project ID. Do not rebuild for TypeScript-only
  changes; inspect current signing/capability and physical-device availability
  before deciding whether one authorized iOS development build is necessary.
- For this approved signing blocker only, register the first Apple-available
  iOS bundle identifier from the owner's ordered candidates. Keep the Android
  application ID, Expo project identity, and all other Apple resources
  unchanged; reuse the already-created APNs key.
- Apple's initial rejection of `com.unimate.app` required the explicitly
  authorized iOS-only identifier change to `com.unimate.ios`; Android and the
  Expo EAS project ID remain unchanged.

## Implementation and evidence

1. Extend provider receipt handling and mocked-fetch coverage.
2. Add versioned send/receipt job schemas and delayed queue support with focused
   unit and local PGMQ tests.
3. Add Prisma registration/delivery models and a new forward migration;
   inspect generated SQL before applying it. Cover database constraints,
   lifecycle, and migration-from-zero while preserving Supabase-owned schemas.
4. Add authenticated registration/unregistration and non-production proof API
   contracts, persistence, ownership tests, and production route isolation.
5. Add provider-neutral send/receipt handlers and composition, including
   duplicate, retry, invalid-token, terminal receipt, and crash-window tests.
6. Add the explicit-action mobile registration/proof flow using current SDK 57
   APIs and existing API/auth/network conventions.
7. Run focused package, API, worker, mobile, database, and queue checks; review
   changed code and architecture boundaries.
8. Complete the live physical-device path and record safe identifiers/status,
   without recording tokens or provider handles. If device access or Apple
   provisioning blocks the proof, leave this plan active and report that exact
   blocker.
9. Run the retrospective once, then `pnpm verify:changed` where useful, exactly
   one final `pnpm verify`, `pnpm secrets:check`, `git diff --check`, and
   `pnpm git-diff`. Do not commit or push.

## Acceptance evidence to record

- Registration ownership/upsert/reactivation and disabled-token behavior.
- Provider ticket/receipt semantics, delayed queue behavior, send/receipt
  idempotency, and the unavoidable pre-persistence crash window.
- API/worker/mobile/database/queue focused results and migration-from-zero
  evidence.
- Compatible development-build and credential decision; physical notification
  acceptance result or concrete blocker.
- Retrospective, changed verification, final verification, secrets/whitespace
  checks, elapsed time, and any notable friction.

## Progress at handoff

- Migration `20261009101917_phase10_push_transport` was generated, reviewed,
  and locally applied. The loopback-guarded reset replayed all six migrations
  from zero, preserved Supabase-owned schemas, and reseeded the two existing
  development users. Re-running the seed left zero push registrations and
  delivery attempts.
- Database integration, registration/API integration, production proof-route
  isolation, Expo send/receipt unit tests, PGMQ delayed-visibility integration,
  and both worker integration tests passed. Worker, API, and mobile focused
  unit/type checks passed; SDK 57 package compatibility passed.
- Native-envelope audit found no missing approved dependency/configuration:
  `expo-notifications` covers push, `@sentry/react-native` is pre-baked for
  Phase 11, the development client covers Phase 13 native smoke testing, and
  the existing EAS project/profile cover Phase 14. No speculative native
  package was added.
- EAS cloud build history was empty. Internal iOS builds were performed
  locally because the iOS app identifier/native config changed; no cloud build
  was used.
  The existing Apple distribution certificate and APNs key are reused, and
  the EAS profile includes only the registered iPhone 17.
- The first local IPA installed but crashed immediately on iOS 27. The
  physical crash report identified `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`;
  the IPA's Info.plist had no scene manifest. Expo SDK 57 includes
  `ExpoAppSceneDelegate`. A new CNG config plugin now adds its scene manifest
  and moves React Native startup from the legacy AppDelegate window path to
  that Expo scene delegate. No dependency was added. The iOS 27 simulator
  gate now passes: local build succeeded, app installed and launched on the
  iOS 27 iPhone 17 simulator, stayed alive with Metro connected, rendered the
  Foundation screen and API health state, and produced a screenshot. Focused
  simulator logs showed the expected UIKit scene identity and no scene crash.
- Xcode MCP tools were configured but were not discoverable in the tool
  catalog during the original device run. Native build/run and focused
  simulator logs used supported Xcode CLI commands; Expo local MCP screenshot
  automation succeeded after simulator startup.
- The initial physical Metro URL over raw Tailscale HTTP failed. Serving Metro
  over private HTTPS at its advertised port 8081 fixed the connection; the
  physical Foundation screen rendered and showed `API: connected`.
- The owner approved one additional local physical-device development build
  only after this simulator gate passed. The corrected signed IPA was built
  locally, installed on the registered iPhone 17, and launched over the
  private HTTPS Metro path on iOS 27 without a new crash report.
- Registration `01a121a0-c075-73a8-8b39-9aa0f3a33587` received two proof
  requests (`01a121a3-5c5b-73cb-ab13-b4deb2433e68` and
  `01a121a3-aa94-7314-bd86-1a34aa89f887`). The corresponding attempts
  (`01a121a3-6080-7750-b0b1-8c879c8baf48` and
  `01a121a3-ac7a-77ea-b854-b4e234f0b6b1`) both reached `RECEIPT_ACCEPTED`
  with scheduled and checked receipts. No tokens or submission handles were
  recorded. The user confirmed the proof notification visibly appeared on the
  physical iPhone 17.
- Tailscale private API/Supabase/Metro paths are configured and verified; no
  Funnel, hosted Supabase, database, or PGMQ exposure occurred.
- Local native building required repairing Fastlane and CocoaPods on this
  host. These were host prerequisites, not repository configuration; no
  Homebrew/PATH workaround was added.
- Physical proof cleanup removed the two proof Outbox rows, both delivery
  attempts, the registration through its synthetic UniMate User, and the
  temporary local Auth user/credential. No related active send or receipt
  queue message remained before cleanup.
- Focused changed-code review found and fixed permanent rejection redelivery:
  a persisted `REJECTED` attempt keeps raising the existing permanent-job
  result until dead-lettering succeeds. Worker unit tests cover send and
  receipt redelivery.
- Original Phase 10 post-iOS-27 validation passed: `pnpm verify:changed` in
  4.6s and `pnpm verify` in 17.6s. The full run passed format, tooling tests,
  secrets check, lint/typecheck/build/tests, OpenAPI, database
  check/integration, authentication, Storage proof, push registration,
  authorization, provider, and worker integrations.
- Original Phase 10 `pnpm secrets:check` passed (57 changed/untracked files
  scanned), `git diff --check` passed, and `pnpm git-diff` completed
  successfully.
  A bounded `/tmp` search found no matching named Phase 10 artifacts to remove.
- Hardening focused validation passed: all 22 mobile tests, mobile lint, and
  mobile typecheck.
- Original and hardening retrospectives were completed separately. Durable
  native lifecycle and private networking facts remain in `NATIVE_RUNTIME.md`;
  `apps/mobile/AGENTS.md` now sets `agent-device` as the QA default and
  distinguishes local/remote Expo MCP and Xcode MCP roles. A focused plugin
  test now preserves the scene-manifest and AppDelegate transformation
  invariants, including idempotency and fail-closed behavior. The largest
  avoidable friction was retries around interactive Apple credential menus;
  the mobile guidance now prohibits PTY/prompt automation. Xcode MCP
  discoverability and repaired host build prerequisites were session-specific,
  so no extra repository workaround was retained. Shell/PATH/Homebrew friction
  was resolved outside the repository by enabling Agent Host zsh
  initialization; the old workaround was not persisted.
- Approximate elapsed time was 7 hours, dominated by interactive Apple
  provisioning, local native builds, and physical-device verification. The
  prior Supabase CLI process was killed during verification; updating only the
  local CLI to 2.120.0 restored status/auth checks. No hosted Supabase project
  was linked or changed.
- Phase 10 is complete. No Notification domain/preferences/inbox, Phase 11
  implementation, App Store submission, commit, or push was made.
