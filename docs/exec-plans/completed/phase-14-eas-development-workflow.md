# Phase 14 — EAS development workflow

**Status:** Complete

## Baseline

- Started from clean `development` at `a102424`; Phase 13 is committed and its
  plan is in `completed/`, with no active Phase 13 plan.
- Seven committed Prisma migrations are current; no database migration is
  planned for this phase.
- The official Expo documentation lookup surfaced SDK 57 release notes and the
  SDK 57 versioned reference, but no SDK 58 stable reference. Keep Expo 57,
  React Native 0.86.3, and the proven iOS scene-lifecycle plugin unchanged.
- Existing runtime policy is `fingerprint`; retain it unless new official,
  project-specific evidence justifies changing it.

## Decisions and evidence

| Area                                        | Decision / evidence                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EAS project and account                     | Existing `@hursty998/unimate` project `f38b01f9-f946-4d79-a4c5-2927f2622487` confirmed; owner/slug/ID match app config. No relink/init.                                                                                                                                                                                                     |
| CLI and remote state                        | EAS CLI 24.11.0 supports fingerprint generation/comparison and build fingerprint lookup. No completed iOS builds, channels, branches, updates, or environment variables existed; one enabled iPhone-class device is registered.                                                                                                             |
| Development public environment              | Only `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set in development. HTTPS origins are tailnet-only; publishable key matches local Supabase. No values copied here.                                                                                                                   |
| SDK-compatible `expo-updates`               | Installed direct dependency 57.0.25; `updates.url` is `https://u.expo.dev/f38b01f9-f946-4d79-a4c5-2927f2622487`.                                                                                                                                                                                                                            |
| Runtime policy / update stream              | Kept `fingerprint`; created `development` branch/channel and configured profile environments/channels. No channel is pinned to the development client.                                                                                                                                                                                      |
| SDK release check                           | Official SDK 57 release notes confirm the current stable baseline; no SDK 58 stable announcement surfaced in the single current-docs check. Keep SDK 57 and React Native 0.86.3.                                                                                                                                                            |
| Fingerprints                                | iOS `38c360f44f0729aae4d7d860998d012c15920ea3`; Android `e3421a226a11cdf5da30729fb37fc16a4c231a26`. A temporary JS-only TS edit regenerated identical hashes on both platforms; source restored.                                                                                                                                            |
| PostHog / Sentry                            | PostHog docs require a replay package/plugin and explicit replay enablement; defer native additions until account-backed activation. Sentry has no configured DSN or hosted upload credentials; source-map/release upload remains deferred.                                                                                                 |
| Focused mobile checks                       | Mobile tests (39), typecheck, lint, and Expo dependency check pass.                                                                                                                                                                                                                                                                         |
| CNG                                         | Initial clean prebuild hit `ENOTEMPTY` on an ignored `ios/Pods/.DS_Store`; no process had the path open. Removed only that stale generated file and clean prebuild then passed for iOS/Android.                                                                                                                                             |
| Local iOS 27 / Android proof                | Local dev builds succeeded. DeviceHub-visible iPhone 17 on iOS 27 and Android emulator launch Foundation UI, show platform fingerprints/update diagnostics, and report `API: connected` with blank API/Supabase URLs and the local publishable key.                                                                                         |
| Matching cloud iOS build / physical install | No matching cloud build existed. One successful internal iOS `development` build: `be26b83b-85be-4f2a-9abf-c95725be743b`; runtime/fingerprint `38c360f44f0729aae4d7d860998d012c15920ea3`. Existing ad-hoc signing/provisioning reused. User approved the iOS install confirmation and opened the client; no cloud retry or Apple 2FA.       |
| Development OTA proof without Metro         | Group `94e2c784-b945-43ae-b9cf-61f89c0bbcfb`, update `01a125f2-faa6-78db-b0b2-db23c4feb20f`, branch/channel/environment `development`. Phone showed `Published EAS Update`, matching runtime and update ID, `API: connected`, and no crash; ports 8081/8082 had no Metro listeners. Auth/getMe not exercised; no synthetic fixture created. |
| Cloud budget / retries                      | One successful cloud iOS development build; no cloud Android, preview, or production builds. No build retry.                                                                                                                                                                                                                                |
| Device evidence / intervention              | Installation used the EAS internal page; user tapped iOS's Open confirmation. CoreDevice screenshot verified the physical app. Accessibility snapshots were unavailable because macOS DevToolsSecurity is disabled; no privileged setting was changed.                                                                                      |
| EAS command notes                           | `fingerprint:compare` with an unlinked raw hash could not infer platform; build-ID comparison is supported and passed. `eas update --json` published successfully; explicitly adding `--non-interactive` also emitted an Expo CLI warning, so the documented command uses `--json` alone.                                                   |
| Retrospective                               | Added narrow mobile-agent guidance for local `.env` isolation, fingerprint reuse/production-channel safety, and DevToolsSecurity consent. Largest recurring friction was simulator Metro/env selection; canonical docs now cover it, and a helper was not justified after one misconfigured start. No Skill, hook, or EAS helper added.     |
| Focused and final verification              | 10 October 2026: mobile tests (39), typecheck, lint, and Expo dependency check passed; `verify:changed` passed (14.3s); the single `pnpm verify` passed (24.3s); `pnpm secrets:check` passed (11 files, no findings); `git diff --check` and `pnpm git-diff` passed at 14:26 BST.                                                           |

## Post-implementation device setup hardening

- After Phase 14, macOS DevToolsSecurity was enabled manually with user
  approval, and Terminal plus Visual Studio Code were enabled under Developer
  Tools privacy permissions. Physical `agent-device` accessibility now passes.
- The authoritative Apple Developer Program Team ID is `MV9MX639KX`.
  `FL78TG7XJV` in the certificate CN parentheses was initially mistaken for
  the Team ID; the certificate Subject OU confirmed `MV9MX639KX`.
- Automatic Signing succeeded with the existing Xcode-managed wildcard
  development profile after refreshing/downloading team profiles through Xcode
  Settings → Accounts. A manual profile override was not required and was not
  the fix.
- The paired/trusted physical iPhone had Developer Mode enabled and the
  existing UniMate development client installed. Physical accessibility
  returned semantic UI. Future sessions check readiness, ask before taking over
  a locked/unready phone or triggering a new authorization, keep PIN/passcode
  entry on the device, and close the active automation session without
  routinely clearing the daemon.
- `expo-updates` was changed from `~57.0.25` to exact `57.0.25`; the resolved
  package remained 57.0.25. iOS fingerprint stayed
  `38c360f44f0729aae4d7d860998d012c15920ea3`; Android stayed
  `e3421a226a11cdf5da30729fb37fc16a4c231a26`. No build or update was needed.

## Constraints

- No Phase 15 work, migrations, production/preview publication or builds, cloud
  Android build, store submission, PostHog activation, commit, or push.
- Use development environment and channel for the sole proof update. Stop before
  a speculative second cloud build; never expose device identifiers, credentials,
  or environment values in this plan.
- EAS Update hosts the JavaScript/assets only. Until services are hosted, API
  and Supabase access still needs the Mac and phone on Tailscale; database and
  queue ports stay loopback-only.
- Local simulator QA briefly started Metro with the ignored phone `.env`
  before the mismatch was noticed. That process was stopped; final iOS/Android
  local proof used blank service URLs and only the local Supabase publishable
  key. A separate single Metro server is temporary and will be stopped before
  the OTA proof.
