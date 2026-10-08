# Phase 2 — Expo Foundation + Native Capability Envelope

**Status:** Complete  
**Started:** 2026-10-07
**Completed:** 2026-10-08

## Objective

Create a minimal Expo Router application in `apps/mobile` for iOS, Android, and web; pre-bake only high-confidence native capabilities; establish CNG, development-client, EAS, and runtime-fingerprint conventions; and verify the app on each local target without beginning Phase 3+ work.

## Repository baseline

- Branch: `development`.
- Worktree was clean before Phase 2.
- Phase 1 is committed at `99a22bd` (`feat: add pnpm workspace configuration and git diff reporting scripts`).
- `apps/mobile/package.json` was the only file under `apps/mobile`.
- The existing root ignore rules already exclude `apps/mobile/ios`, `apps/mobile/android`, `.expo`, web export output, and native build archives.

## Package and version decisions

- Official Expo release notes confirm SDK 57 is stable and targets React Native 0.86; the SDK 57 versioned documentation was checked at `https://docs.expo.dev/versions/v57.0.0/`.
- The official `pnpm create expo` default scaffold selected Expo 57.0.27, React Native 0.86.3, React/React DOM 19.2.3, React Native Web 0.21.3, and Expo Router 57.0.25. This is the current stable SDK 57 patch line at implementation time.
- The mobile `build` task is `expo export --platform web`; Turbo now caches its stable `dist/**` output. Generated native build directories are not part of the normal monorepo build task.
- Expo-compatible installation selected `expo-dev-client` 57.0.19; `expo-application` 57.0.3; `expo-camera` 57.0.6; `expo-document-picker` 57.0.3; `expo-file-system` 57.0.7; `expo-haptics` 57.0.3; `expo-image-picker` 57.0.20; `expo-notifications` 57.0.22; `expo-secure-store` 57.0.4; `expo-sqlite` 57.0.4; and `react-native-svg` 15.15.4.
- Other Expo-aligned versions selected by the scaffold are `expo-constants` 57.0.21, `expo-device` 57.0.2, `expo-font` 57.0.4, `expo-image` 57.0.5, `expo-linking` 57.0.12, `expo-splash-screen` 57.0.9, `expo-status-bar` 57.0.1, `expo-system-ui` 57.0.4, `expo-web-browser` 57.0.3, `react-native-gesture-handler` 2.32.0, `react-native-reanimated` 4.5.1, `react-native-safe-area-context` 5.7.0, `react-native-screens` 4.26.2, and `react-native-worklets` 0.10.1.
- Compatible future capabilities installed through the Expo installer are AsyncStorage 2.2.0, Stripe React Native 0.64.0, and Sentry React Native 7.11.0. Expo's SDK 57 reference explicitly documents Stripe and AsyncStorage; Sentry's official Expo guide supports SDK 50+.
- Direct dependencies are pinned to the exact versions selected by the Expo-compatible installer, preserving the Phase 1 exact-version policy.
- `@expo/ui`, `expo-glass-effect`, and `expo-symbols` sample UI was removed. Expo Router still pulls those SDK 57 modules transitively; they are recorded in the native inventory and none of their UI components are used.
- Do not use Expo Go; use `expo-dev-client` and local native development builds.
- SQLite is reserved for structured local relational data; AsyncStorage is reserved for small, non-sensitive key/value preferences; SecureStore is for future sensitive native session material.
- The optional Stripe config plugin is omitted because it requires app-specific Apple Pay merchant configuration; the compatible native SDK is installed and autolinked. No merchant identifier is invented.
- No Sentry DSN, plugin, auth token, or backend reporting is configured; only the compatible native SDK is pre-baked for Phase 11.

## Native-dependency inventory

Record every installed native package and its purpose/configuration/rebuild implications in `docs/engineering/NATIVE_RUNTIME.md`. The initial candidates are:

- Foundation/navigation: `expo-dev-client`, `expo-router`, `react-native-screens`, `react-native-safe-area-context`, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-svg`.
- Device/application: `expo-application`, `expo-constants`, `expo-device`.
- Auth/session/navigation infrastructure: `expo-secure-store`, `expo-linking`, `expo-web-browser`.
- Media/files/camera: `expo-image`, `expo-image-picker`, `expo-document-picker`, `expo-file-system`, `expo-camera`.
- Interaction/app shell/notifications: `expo-haptics`, `expo-splash-screen`, `expo-status-bar`, `expo-system-ui`, `expo-font`, `expo-notifications`.
- Persistence candidates: `expo-sqlite`, `@react-native-async-storage/async-storage`.
- Approved future payments: `@stripe/stripe-react-native`.
- Error reporting candidate: `@sentry/react-native`; include only if current Expo guidance supports it without premature DSN/backend configuration.

## Implementation steps

1. Verify stable SDK 57 package compatibility, generated scaffold conventions, and Expo configuration requirements from current official documentation/tooling.
2. Scaffold the app inside `apps/mobile`, preserve `@unimate/mobile`, and add the neutral replaceable foundation route and a simple navigable validation route.
3. Configure Expo Router, stable deep-link scheme, app identifiers, TypeScript, and central ESLint integration without a final visual design or environment variables.
4. Install the approved native envelope via Expo-compatible package installation and document each native package.
5. Establish CNG, ignored generated native directories, EAS profiles/project linkage, and fingerprint-based runtime compatibility without running cloud builds.
6. Integrate mobile `dev`, `lint`, `typecheck`, and web-export `build` tasks with the existing Turbo/root commands; keep tests N/A unless a substantive Phase 2 test is justified.
7. Build and inspect web, iOS Simulator, and Android emulator locally; run repository validation and record exact outcomes.
8. Move this plan to completed only if the required Phase 2 acceptance checks pass; otherwise retain it in active with blockers.

## EAS decisions

- Use `eas init`/the current official project-linking command only after app config is ready and authentication is confirmed.
- No EAS cloud build, production credential, or signing setup is authorised in this phase.
- Define development, iOS Simulator development, preview, and production profiles; verify each against current EAS guidance.
- Use the current recommended fingerprint runtime-version policy if supported by SDK 57. Defer automated build-reuse workflows to Phase 14.
- `development-simulator` is a separate profile extending `development` with `ios.simulator: true`; regular `development` remains available for internal physical-device distribution.
- EAS CLI 24.11.0 authenticated successfully. `eas init --account hursty998 --non-interactive --json --no-icon` created and linked `@hursty998/unimate` as project `f38b01f9-f946-4d79-a4c5-2927f2622487`; the CLI added the project ID/owner to `app.json`. `eas config` validated development (Android), development-simulator (iOS), preview (iOS), and production (iOS) profiles. No EAS cloud build was run and no signing credentials were generated.

## Validation record

| Check                                                                          | Result                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository branch/worktree/Phase 1/mobile baseline                             | PASS — `development`, clean, Phase 1 commit `99a22bd`, manifest-only mobile package                                                                                                                                                            |
| Official stable SDK/version compatibility check                                | PASS — official SDK 57 release notes/reference and `pnpm create expo` default template agree on stable SDK 57; Expo-compatible install selected the requested compatible modules                                                               |
| Expo-compatible dependency install and `expo install --check`                  | PASS — requested Expo modules resolved to SDK 57 versions; `expo install --check` reports dependencies are up to date                                                                                                                          |
| Initial Expo config validation                                                 | PASS — Expo resolves app identity, `unimate` scheme, iOS/Android identifiers, native plugins, and fingerprint policy                                                                                                                           |
| Mobile typecheck/lint                                                          | PASS — strict TypeScript and central ESLint pass; the Expo config extends the official Expo base and mirrors shared strict flags; `ignoreDeprecations: "6.0"` suppresses only TypeScript's `baseUrl` deprecation                               |
| Native inventory and agent guidance link                                       | PASS — `docs/engineering/NATIVE_RUNTIME.md` created and linked from Engineering Principles                                                                                                                                                     |
| EAS project link and profiles                                                  | PASS — project ID `f38b01f9-f946-4d79-a4c5-2927f2622487`; development, simulator development, preview, and production configuration resolved; no cloud build or signing credentials                                                            |
| Frozen install                                                                 | PASS — `pnpm install --frozen-lockfile`                                                                                                                                                                                                        |
| `expo install --check`                                                         | PASS — all direct Expo dependencies match SDK 57 recommendations                                                                                                                                                                               |
| Exact-version policy                                                           | PASS — all 36 external direct mobile dependency versions are exact                                                                                                                                                                             |
| Central ESLint architecture import probes                                      | PASS — database and `@unimate/*/server` imports are rejected in mobile                                                                                                                                                                         |
| Root `pnpm dev`                                                                | PASS — starts the Expo development client server; Metro `/status` returned `packager-status:running`                                                                                                                                           |
| `pnpm format:check`                                                            | PASS — generated `expo-env.d.ts` is excluded from formatting; repository files use Prettier                                                                                                                                                    |
| `pnpm lint`                                                                    | PASS — root, ESLint-config, and mobile tasks                                                                                                                                                                                                   |
| `pnpm typecheck`                                                               | PASS — mobile strict TypeScript task                                                                                                                                                                                                           |
| `pnpm test`                                                                    | PASS — 4 existing repository tooling tests; mobile has no substantive test suite yet (N/A)                                                                                                                                                     |
| `pnpm build`                                                                   | PASS — Expo static web export generated `/`, `/validation`, `/_sitemap`, and `+not-found` into ignored `dist/`                                                                                                                                 |
| `pnpm verify`                                                                  | PASS — format, lint, typecheck, web export, and the 4 repository tooling tests                                                                                                                                                                 |
| `pnpm verify:changed`                                                          | PASS — formatting, tooling tests, and affected lint/typecheck/build/test tasks                                                                                                                                                                 |
| Web integrated-browser inspection (phone + desktop, route navigation, console) | PASS — phone 390×844 and desktop 1440×900 rendered the foundation routes; navigation passed, Metro served the root without fatal errors; one non-fatal aria-hidden focus warning appeared during navigation                                    |
| Local iOS Simulator build and agent-device inspection                          | PASS — local Xcode build/install and agent-device screen, navigation, and `unimate://validation` checks succeeded. Expo CLI returned 1 only at its final AppleScript simulator check; see deviations. Screenshot saved outside the repository. |
| Local Android emulator build and agent-device inspection                       | PASS — regenerated CNG resources, Gradle build/install succeeded, and agent-device observed Android platform text plus route navigation; screenshot saved outside the repository.                                                              |
| EAS cloud build quota/signing credentials                                      | PASS — no cloud build or signing credentials created                                                                                                                                                                                           |
| `pnpm git-diff` and `git diff --check`                                         | PASS — final working-tree report generated; no whitespace errors                                                                                                                                                                               |
| Native directory/build-output/secret hygiene                                   | PASS — iOS/Android, `.expo`, `dist`, and Android build output are ignored and untracked; no signing credential files or nested Git repository are tracked                                                                                      |

The iOS and Android validation screenshots are preserved as session artifacts,
not committed:

- `/Users/henry/.copilot/session-state/95343acc-6e51-4f4a-94a6-9e399b9922a6/files/phase-02-ios-validation.png`
- `/Users/henry/.copilot/session-state/95343acc-6e51-4f4a-94a6-9e399b9922a6/files/phase-02-android-validation.png`

## Commands and runtime evidence

- Scaffolded with `pnpm create expo apps/mobile --template default --no-install --no-agents-md`.
- Installed scaffold dependencies with `pnpm install`, then capabilities with `pnpm expo install expo-dev-client expo-application expo-secure-store expo-document-picker expo-file-system expo-camera expo-haptics expo-notifications expo-sqlite expo-image-picker @react-native-async-storage/async-storage @stripe/stripe-react-native @sentry/react-native react-native-svg`; validated with `pnpm expo install --check`.
- Used `pnpm install --lockfile-only` after pinning exact direct versions and `pnpm install --frozen-lockfile` for the final lockfile check.
- Generated native projects with `pnpm expo prebuild --platform ios --clean` and `pnpm expo prebuild --platform android --clean`; built/installed with `pnpm --filter @unimate/mobile ios` and `pnpm --filter @unimate/mobile android`.
- Checked EAS auth/linking with `eas whoami` and `eas init --account hursty998 --non-interactive --json --no-icon`; validated development, development-simulator, preview, and production with `eas config`. No cloud build was run.
- Exercised root `pnpm dev` and Metro `/status`; opened the app in the VS Code integrated browser at phone and desktop sizes, navigated `/validation`, and checked for fatal browser errors.
- Used `agent-device open com.unimate.app --platform ios --foreground` and the Android equivalent, verified visible platform text/navigation, and opened `unimate://validation` on iOS.
- EAS profile checks: `eas config --profile development --platform ios --json`, `eas config --profile development-simulator --platform ios --json`, and the equivalent `preview`/`production` checks; all resolved without builds.
- Local app checks: `pnpm --filter @unimate/mobile dev -- --localhost --port 8081`, root `pnpm dev`, `pnpm build`, local iOS/Android prebuild and run commands, and `agent-device` on both platforms.
- Repository checks run: `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm verify`, `pnpm verify:changed`, `pnpm git-diff`, and `git diff --check`. Generated native/build output, credential filenames, and nested-repository hygiene were checked.

## Deviations

- The generated `create-expo` sample included an unrelated tab UI, Expo design samples, and extra UI/effect/icon packages. These were removed and replaced with a neutral two-route foundation screen.
- Expo config evaluation found that the optional Stripe config plugin requires plugin options. Because the package's Expo SDK 57 reference marks the plugin optional and no Apple merchant ID exists, the plugin was removed while retaining the compatible SDK package for autolinking; Apple Pay configuration remains deferred.
- During initial Phase 2 work the checkout path contained spaces, which led to temporary Expo Constants and generated Xcode-script workarounds. The user moved the repository to `/Users/henry/Documents/Projects/UniMates-2026/unimate-2026`; this tidy-up removed both workarounds, regenerated native projects from clean CNG, and standard local iOS and Android builds/installations passed without them.
- Expo CLI previously reported an AppleScript `System Events` permission failure after completing an iOS build. In this tidy-up, `expo run:ios` completed successfully after the repository move; agent-device independently confirmed app launch and navigation.
- The first Xcode attempt also reported an Expo Camera barcode-scanner XCFramework copy-phase failure; it did not reproduce after the path fix and the targeted rsync dry run succeeded.
- Expo's current TypeScript guide requires `baseUrl: "."` for `@/*` aliases. Without it, Metro reported unresolved foundation imports. TypeScript 6.0.3 deprecates `baseUrl`; `ignoreDeprecations: "6.0"` suppresses only that warning until the Expo/TypeScript alias guidance changes. After the documented setting, Metro resolves the routes and iOS renders correctly.
- Extending the workspace TypeScript base from outside `apps/mobile` made Expo SDK 57's Metro tsconfig resolver throw `Failed to collapse`. The mobile config therefore extends Expo's base directly and mirrors the shared strict flags; the shared base remains the source of those principles.
- The first Android build exposed an SDK 57 splash-resource requirement when no image was configured. The splash now uses the neutral placeholder app icon and the regenerated Android build passed. Gradle reported upstream deprecation warnings but no build errors.

## Final Phase 2 tidy-up — 2026-10-08

The repository was moved to `/Users/henry/Documents/Projects/UniMates-2026/unimate-2026` without changing its Git metadata. From that path:

- PASS — removed `patches/expo-constants@57.0.21.patch`, the `patchedDependencies` configuration, and `apps/mobile/plugins/with-space-safe-bundle-script.js` plus its `app.json` entry.
- PASS — pnpm lockfile regenerated by normal `pnpm install`; `expo-constants@57.0.21` resolves from the standard, unpatched pnpm store path.
- PASS — `pnpm exec expo prebuild --platform all --clean --no-install` generated fresh iOS and Android projects with the standard SDK 57 plugins. Both generated directories remain ignored.
- PASS — normal `pnpm --filter @unimate/mobile ios` and `pnpm --filter @unimate/mobile android` built and installed locally from the no-space repository path.
- PASS — agent-device verified iOS/Android foundation text and route navigation; iOS `unimate://validation` deep link opened the validation route.
- PASS — final Expo web server returned HTTP 200 for `/` and `/validation`, with expected foundation text; static export includes both routes. The VS Code integrated browser was not re-run during this tidy-up (the existing Phase 2 phone/desktop browser inspection above predates the path move; no UI files changed here).
- PASS — Expo SDK 57 dependency check, Expo config evaluation, EAS authentication/linkage, and all development/preview/production profiles resolved. No EAS cloud build or signing credentials were used.
- PASS — `pnpm@10.33.0` resolves from both the default non-login shell and login shell at `/Users/henry/.nvm/versions/node/v24.14.0/bin/pnpm`; no machine shell configuration or package-manager version changed.
- PASS — frozen install, format, lint, typecheck, build, tests, verify, verify:changed, git-diff, and diff check passed after this tidy-up.
- PASS — Expo web dev server returned HTTP 200 for `/` and `/validation`; both returned the expected foundation text, and static export contains both routes. No screen/UI code changed in this tidy-up. The VS Code integrated browser was not re-run during this tidy-up; the Phase 2 integrated-browser phone/desktop navigation result above remains the prior visual evidence.
