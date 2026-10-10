# EAS development workflow

Operational source of truth for native compatibility, development-build reuse,
and OTA delivery. Native package inventory and CNG rules are in
[`NATIVE_RUNTIME.md`](./NATIVE_RUNTIME.md).

## Current project state

- The app remains linked to the existing `@hursty998/unimate` EAS project
  (`f38b01f9-f946-4d79-a4c5-2927f2622487`). Owner, slug, iOS bundle ID
  `com.unimate.ios`, and Android package `com.unimate.app` are unchanged.
- Expo SDK 57 (`expo` 57.0.27) is the current stable SDK in the official
  versioned references; SDK 58 was not shown as stable in the 10 October 2026
  lookup. No SDK or React Native upgrade is part of Phase 14.
- `expo-updates` 57.0.25 is a direct native dependency. EAS Update is enabled
  with `updates.url` set to
  `https://u.expo.dev/f38b01f9-f946-4d79-a4c5-2927f2622487`.
- `runtimeVersion.policy` remains `fingerprint`: native dependencies and
  generated native configuration determine the update runtime. At foundation
  version `0.0.0`, avoiding an update against unavailable native code is more
  important than minimizing builds.
- `development` is an internal dev client using EAS environment `development`.
  `development-simulator` extends it with iOS Simulator output.
  `preview` is internal on channel/environment `preview`; `production` uses
  channel/environment `production`. Preview/production backend values are not
  configured; do not build or publish there until their public client config
  exists.
- Development OTA publications use channel/branch `development` and environment
  `development`. The development-client build is intentionally not pinned to
  a channel: it can preview any compatible channel, and `Updates.channel` is
  null in development clients.
- The development EAS environment contains only
  `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, and
  `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. These are public client settings
  sourced from the ignored physical-device config and local Supabase status.
  Never add a database URL/password, Supabase service-role/secret key, or Apple
  credential as an `EXPO_PUBLIC_*` value.
- Phase 14 consumed one successful internal iOS development build:
  `be26b83b-85be-4f2a-9abf-c95725be743b`. The installed runtime and iOS
  fingerprint are `38c360f44f0729aae4d7d860998d012c15920ea3`.
- One iOS-only proof update was published to branch/channel `development` with
  EAS environment `development`: group `94e2c784-b945-43ae-b9cf-61f89c0bbcfb`,
  update `01a125f2-faa6-78db-b0b2-db23c4feb20f`. Its runtime fingerprint
  matches the installed build. The registered phone displayed that update ID,
  `Published EAS Update`, the matching runtime, and connected API status while
  Metro was stopped. The completed Phase 14 plan records the proof details.

## Native rebuild or EAS Update?

Treat changes to Expo/React Native, a native dependency, config plugin, or
native app configuration as native-runtime changes. They require a compatible
development build. App icon/splash settings, permissions, entitlements, URL
schemes, and other generated native settings are not ordinary bundled assets.

Ordinary application TypeScript/JavaScript, React UI, styles, and compatible
bundled content assets generally do not require a rebuild. The EAS fingerprint
is the mechanical compatibility check; do not infer it from a change summary.

## Fingerprint and build reuse

Run these from `apps/mobile`, using the same logical development environment
for fingerprinting, builds, and updates. For local fingerprint and publication
commands, set `EXPO_NO_DOTENV=1` so the ignored physical-device `.env` cannot
shadow the selected EAS environment:

```sh
EXPO_NO_DOTENV=1 eas fingerprint:generate --platform ios --environment development --json
EXPO_NO_DOTENV=1 eas fingerprint:generate --platform android --environment development --json
EXPO_NO_DOTENV=1 eas fingerprint:compare --build-id <IOS_DEVELOPMENT_BUILD_ID> --environment development
```

Look for a successful physical-device iOS development build with that
fingerprint before consuming cloud build quota:

```sh
eas build:list --platform ios --status finished --build-profile development \
  --fingerprint-hash <IOS_FINGERPRINT> --limit 50 --json
```

Compare the current native project with the candidate build. To verify an
update against the installed build, compare the build and platform update IDs:

```sh
EXPO_NO_DOTENV=1 eas fingerprint:compare --build-id <BUILD_ID> --environment development
EXPO_NO_DOTENV=1 eas fingerprint:compare --build-id <BUILD_ID> --update-id <UPDATE_ID>
```

A mismatch requires local iOS/Android native validation. Reuse a matching
build if one exists; otherwise create only the needed physical iOS client:

```sh
eas build --platform ios --profile development --non-interactive
```

The profile selects EAS environment `development`. Do not auto-submit, make a
speculative cache-cleared retry, or create a cloud Android build. Diagnose a
failed build and prove a deterministic correction locally before any retry.

## TypeScript/JavaScript/assets-only update

From `apps/mobile`, run focused verification first. Then generate the iOS
development fingerprint, find and compare the installed build, and publish
only after a match:

```sh
EXPO_NO_DOTENV=1 eas fingerprint:generate --platform ios --environment development --json
eas build:list --platform ios --status finished --build-profile development \
  --fingerprint-hash <IOS_FINGERPRINT> --limit 50 --json
EXPO_NO_DOTENV=1 eas fingerprint:compare --build-id <MATCHING_BUILD_ID> --environment development
EXPO_NO_DOTENV=1 eas update --channel development --platform ios --environment development \
  --message "Short, explicit development update reason" --json
```

Refuse publication if verification is red, the development public variables
are missing, the channel is ambiguous, or the installed build fingerprint
does not match. Record the update group ID, runtime version, channel, and
platform update ID. Do not copy environment values or artifact URLs into
logs/docs.

To open one published update without Metro, enter this URL in the development
client's **Enter URL Manually** launcher:

```text
unimate://expo-development-client/?url=https://u.expo.dev/f38b01f9-f946-4d79-a4c5-2927f2622487/group/<UPDATE_GROUP_ID>
```

The `unimate` scheme is configured in the app. The dev client's **Extensions**
tab can also preview published updates; that tab requires Expo account login.
A physical proof shows a non-embedded bundle, the published update ID, and a
runtime version matching the installed native build in the Foundation screen.

## Physical-device and network boundary

Install the internal development client once from its EAS distribution link.
Normal compatible updates require neither USB nor Metro, and the phone does not
need to share the Mac's LAN to download the OTA bundle.
For a new developer Mac/iPhone, Apple development signing, and physical
`agent-device` accessibility setup, see
[`IOS_DEVICE_SETUP.md`](./IOS_DEVICE_SETUP.md).

EAS Update hosts JavaScript/assets only; it does not deploy the UniMate API or
database. Until those services are hosted, authenticated/data flows still need
the Mac's local NestJS API and Supabase, with Tailscale connected on both
devices. Tailscale Serve exposes only the approved API/Supabase HTTP gateways.
PostgreSQL and PGMQ remain loopback-only, so turning off the Mac stops backend
access but not delivery of a published update.

For local simulator/emulator validation, disable loading
`apps/mobile/.env`. Use blank API/Supabase URLs so iOS uses loopback and
Android uses `10.0.2.2`, plus the local Supabase publishable key. Never use the
phone's Tailscale origins for simulator-local tests.

## Channels and recovery

- `development`: personal/agent development updates and device QA only.
- `preview`: future internal pilot/stakeholder testing; no local-backend
  placeholder values and no Phase 14 build/update.
- `production`: future released users; never a convenient test channel.

Inspect before changing a stream:

```sh
eas channel:list --json
eas branch:list --json
eas update:list --branch development --platform ios --limit 50 --json
eas update:view <UPDATE_GROUP_ID>
```

For a development-only recovery, `eas update:rollback <LATEST_GROUP_ID>
--platform ios --non-interactive` republishes the preceding compatible update
(or the embedded update if none exists). To restore a known-good group, use
`eas update:republish --group <KNOWN_GOOD_GROUP_ID> --channel development
--platform ios --message "Reason"`. Confirm branch, platform, runtime, and
target channel first. A channel can be retargeted with
`eas channel:edit development --branch <REVIEWED_BRANCH>`. Do not perform
production rollback/retarget operations in this phase.

## Sentry and PostHog

Optional Sentry React Native initialization remains inactive without a DSN. No
hosted DSN or auth token is configured, so source-map, symbol, and release
upload integration is deferred until a hosted Sentry project is intentionally
configured. Do not add a token to make EAS Update work.

PostHog is not activated; no project, key, provider, or event tracking was
added. Current PostHog React Native replay guidance requires the replay package
and plugin plus explicit SDK enablement. A fully inert pre-bake was not
established as safe for this project, so replay is deferred; enabling it later
requires native validation and a development-client rebuild. Analytics and
replay remain a separate approved task. See
[PostHog's React Native session replay setup](https://posthog.com/docs/session-replay/installation/react-native).
