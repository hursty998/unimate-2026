# Mobile Native Runtime

This document is the inventory and change policy for the Expo native runtime in
`apps/mobile`.

## Runtime baseline

- Expo SDK: 57 (`expo` 57.0.27), stable as checked on 10 October 2026.
- React Native: 0.86.3.
- React: 19.2.3.
- React Native Web: 0.21.3.
- Expo Router: 57.0.25.
- Development client: `expo-dev-client` 57.0.19.
- Expo Router runs from `src/app`; route files only compose feature screens.
- The TypeScript config extends Expo's base and mirrors the strict options from
  the [shared base config](../../packages/typescript-config/base.jsonc). Expo's
  current alias guide requires `baseUrl` for Metro; TypeScript 6.0 deprecates
  that option, so `ignoreDeprecations: "6.0"` suppresses only that diagnostic
  while retaining strict type checking.
- CNG is used. `apps/mobile/ios` and `apps/mobile/android` are generated from
  app config, config plugins, and installed native modules; both directories
  are ignored and must not be committed or maintained manually.
- iOS 27 requires a UIKit scene lifecycle at launch. The Expo SDK 57
  `ExpoAppSceneDelegate` is wired through the
  `with-ios-scene-lifecycle` config plugin: the generated scene manifest names
  Expo's delegate, and the generated AppDelegate provides the React Native
  factory without also starting a legacy app-delegate window. Keep both changes
  in Expo config/plugin source; never patch generated `ios/` files.
- The repository is currently located at `/Users/henry/Documents/Projects/UniMates-2026/unimate-2026`. Standard SDK 57 CNG and local builds work from this no-space path without repository-specific shell-path workarounds.
- `runtimeVersion.policy` is `fingerprint`; EAS Update uses the existing
  project's `updates.url`. Development updates use the `development` channel
  and environment. Development clients are not pinned to a channel.
- The flat-gray app icon/splash asset is a replaceable placeholder, not final
  UniMate branding.

Expo SDK 57 was verified as stable in the
[SDK 57 release notes](https://expo.dev/changelog/sdk-57) and the
[versioned SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/).
The official current lookup did not show SDK 58 as stable, so Phase 14 keeps
SDK 57 and React Native 0.86.3. The proven iOS 27 scene-lifecycle plugin stays
enabled; it is not replaced or removed.
The versioned Expo installer selected SDK-compatible versions for Expo
packages, Stripe, and React Native SVG. Direct dependencies are pinned to the
exact versions selected by the scaffold and Expo-compatible installer.

## Installed capability inventory

`Native runtime: Yes` means the package contributes native code, native
configuration, or the React Native runtime and therefore belongs to the
development-client fingerprint. Adding, removing, or upgrading it requires a
new local/EAS development build before the changed native runtime can be used.
`No` means it is web-only or build-time/type-only and does not itself require a
native rebuild.

| Package                                     | Version | Runtime        | Expected UniMate use / phase status                                                                                                 | Configuration or permissions                                                                                                                                                                                                                |
| ------------------------------------------- | ------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expo`                                      | 57.0.27 | Yes            | Required now; Expo framework and native module integration.                                                                         | App config and CNG; no permission by itself.                                                                                                                                                                                                |
| `react`                                     | 19.2.3  | Yes, framework | Required now; React runtime paired with this Expo/RN release.                                                                       | No app permission; upgrade with the compatible Expo/RN set and rebuild.                                                                                                                                                                     |
| `react-native`                              | 0.86.3  | Yes            | Required now; native application runtime.                                                                                           | SDK-compatible native toolchain; rebuild on upgrade.                                                                                                                                                                                        |
| `react-dom`                                 | 19.2.3  | No             | Required now for the web target.                                                                                                    | Web only.                                                                                                                                                                                                                                   |
| `react-native-web`                          | 0.21.3  | No             | Required now for the web target.                                                                                                    | Web only.                                                                                                                                                                                                                                   |
| `expo-router`                               | 57.0.25 | Yes            | Required now; shared iOS/Android/web file-based navigation and deep-link foundation.                                                | `expo-router` config plugin, `src/app`, and the `unimate` scheme.                                                                                                                                                                           |
| `@expo/ui`                                  | 57.0.22 | Yes            | Transitive Expo Router SDK 57 dependency; no `@expo/ui` components are used in the foundation screen.                               | No permission or app-specific configuration.                                                                                                                                                                                                |
| `expo-glass-effect`                         | 57.0.4  | Yes            | Transitive Expo Router SDK 57 dependency; no glass effect is used or selected as a UniMate visual convention.                       | No permission or app-specific configuration.                                                                                                                                                                                                |
| `expo-symbols`                              | 57.0.3  | Yes            | Transitive Expo Router SDK 57 dependency; no symbol/icon system is selected in this phase.                                          | No permission or app-specific configuration.                                                                                                                                                                                                |
| `expo-dev-client`                           | 57.0.19 | Yes            | Required now; the supported development strategy is a custom development client, not Expo Go.                                       | Config plugin selects the development launcher; rebuild to update the client.                                                                                                                                                               |
| `expo-updates`                              | 57.0.25 | Yes            | Required for EAS Update delivery and safe update diagnostics.                                                                       | Native runtime dependency. `updates.url` is configured and the runtime policy is `fingerprint`; adding/upgrading it requires a development-client rebuild.                                                                                  |
| `expo-constants`                            | 57.0.21 | Yes            | Required now; Expo app/device configuration metadata and Router support.                                                            | No permission.                                                                                                                                                                                                                              |
| `expo-linking`                              | 57.0.12 | Yes            | Required now; Router linking and future app/universal links.                                                                        | `unimate://` is configured; HTTPS domains are deferred.                                                                                                                                                                                     |
| `react-native-screens`                      | 4.26.2  | Yes            | Required now; native navigation screen primitives.                                                                                  | Used by Expo Router; no permission.                                                                                                                                                                                                         |
| `react-native-safe-area-context`            | 5.7.0   | Yes            | Required now; native safe-area support.                                                                                             | No permission.                                                                                                                                                                                                                              |
| `react-native-gesture-handler`              | 2.32.0  | Yes            | Pre-baked foundation navigation/gesture capability.                                                                                 | Root layout installs `GestureHandlerRootView`; no permission.                                                                                                                                                                               |
| `react-native-reanimated`                   | 4.5.1   | Yes            | Pre-baked foundation animation capability for future interaction and transitions.                                                   | Uses SDK-compatible `react-native-worklets`; Expo Babel integration; no permission.                                                                                                                                                         |
| `react-native-worklets`                     | 0.10.1  | Yes            | Required by the selected Reanimated 4 runtime.                                                                                      | Native worklet runtime; no permission.                                                                                                                                                                                                      |
| `react-native-svg`                          | 15.15.4 | Yes            | Pre-baked for scalable illustrations, icons, and image/vector rendering.                                                            | No permission.                                                                                                                                                                                                                              |
| `expo-application`                          | 57.0.3  | Yes            | Pre-baked for app version/build metadata and support diagnostics.                                                                   | No permission.                                                                                                                                                                                                                              |
| `expo-device`                               | 57.0.2  | Yes            | Pre-baked for device/platform metadata and device-capability checks.                                                                | No permission.                                                                                                                                                                                                                              |
| `expo-secure-store`                         | 57.0.4  | Yes            | Native protected persistence for the Supabase Auth session.                                                                         | Secure storage only; Face ID usage text is needed only if biometric-protected reads are later enabled.                                                                                                                                      |
| `expo-web-browser`                          | 57.0.3  | Yes            | Pre-baked for future browser-based sign-in and external authentication handoffs.                                                    | No permission; configure redirect handling with the auth flow later.                                                                                                                                                                        |
| `expo-image`                                | 57.0.5  | Yes            | Pre-baked for performant remote/local image display.                                                                                | No permission.                                                                                                                                                                                                                              |
| `expo-image-picker`                         | 57.0.20 | Yes            | Pre-baked for profile/event/merchandise image selection.                                                                            | iOS photo/camera usage text is configured; microphone permission is disabled. Runtime permission is requested only when used.                                                                                                               |
| `expo-document-picker`                      | 57.0.3  | Yes            | Pre-baked for selecting event and organisation documents.                                                                           | Uses platform document pickers; no broad file-library permission is configured.                                                                                                                                                             |
| `expo-file-system`                          | 57.0.7  | Yes            | Pre-baked for downloads, uploads, and local file handling.                                                                          | App-scoped file storage; no broad storage permission.                                                                                                                                                                                       |
| `expo-camera`                               | 57.0.6  | Yes            | Pre-baked for expected event/ticket QR scanning.                                                                                    | Camera usage text is configured; Android audio recording and iOS microphone access are disabled. Camera permission is requested only when used.                                                                                             |
| `expo-haptics`                              | 57.0.3  | Yes            | Pre-baked for native interaction feedback.                                                                                          | No permission.                                                                                                                                                                                                                              |
| `expo-font`                                 | 57.0.4  | Yes            | Pre-baked for app-shell and future approved typography assets.                                                                      | No permission; no UniMate font or typography system is selected in this phase.                                                                                                                                                              |
| `expo-splash-screen`                        | 57.0.9  | Yes            | Required now; native launch-screen control.                                                                                         | White background with the neutral placeholder icon; no final splash artwork.                                                                                                                                                                |
| `expo-status-bar`                           | 57.0.1  | Yes            | Required now; platform status-bar presentation for the app shell.                                                                   | Uses automatic platform style; no permission.                                                                                                                                                                                               |
| `expo-system-ui`                            | 57.0.4  | Yes            | Pre-baked for native system-bar/background integration.                                                                             | No permission.                                                                                                                                                                                                                              |
| `expo-notifications`                        | 57.0.22 | Yes            | Pre-baked and reused in Phase 10 for explicit-action Expo push-token registration and token-change handling.                        | Existing `expo-notifications` config plugin is enabled. Notification permission is requested only from the development Foundation push action; Expo/EAS credentials are inspected before physical proof. No new native package is required. |
| `expo-sqlite`                               | 57.0.4  | Yes            | Pre-baked for structured relational local cache/offline data if a later feature needs it. No local business schema is created.      | No native permission; Expo documents web support as alpha and requiring WASM/COOP/COEP setup before using it on web.                                                                                                                        |
| `@supabase/supabase-js`                     | 2.117.3 | No             | Auth-only client adapter for email/password, session restoration, and refresh. It does not access UniMate application tables.       | JavaScript package; no native configuration or permission.                                                                                                                                                                                  |
| `react-native-url-polyfill`                 | 4.0.0   | No             | URL compatibility used by the Supabase React Native Auth adapter.                                                                   | JavaScript package; no native configuration or permission.                                                                                                                                                                                  |
| `@react-native-async-storage/async-storage` | 2.2.0   | Yes            | Pre-baked for small, non-sensitive persistent key/value preferences. It is distinct from SQLite and SecureStore.                    | Unencrypted; do not store credentials, tokens, or sensitive data. No permission.                                                                                                                                                            |
| `@stripe/stripe-react-native`               | 0.64.0  | Yes            | Pre-baked for approved future paid Event and merchandise flows; no payment UI or transaction logic is implemented.                  | Native SDK autolinks. The optional Stripe config plugin is not enabled because Apple Pay merchant configuration is not approved/provisioned; add it with a real merchant identifier when payments are implemented.                          |
| `@sentry/react-native`                      | 7.11.0  | Yes            | Optional JavaScript initialization is active only when `EXPO_PUBLIC_SENTRY_DSN` is configured; default PII and replay are disabled. | No native rebuild or config plugin is needed. No hosted DSN/auth token is configured; source-map/release integration remains deferred. See [`OBSERVABILITY.md`](./OBSERVABILITY.md).                                                        |

## PostHog native envelope

No PostHog SDK, replay package, account, key, provider, or event tracking is
pre-baked or active. Current official React Native session replay setup
requires native packages/configuration and explicit SDK enablement; an inert
pre-bake was not established as safe. Defer it until an approved PostHog
project exists. Enabling session replay later requires native validation and a
new development build. See [`EAS_WORKFLOW.md`](./EAS_WORKFLOW.md).

The default template's `@expo/ui`, `expo-glass-effect`, and `expo-symbols`
sample UI and direct dependencies were removed. Expo Router brings these SDK
57 modules transitively; they remain in the native runtime for Router support,
but the foundation app does not use their components or establish their
visual style.

## Storage roles

- `expo-secure-store`: small secrets and the native Supabase Auth session. The
  Auth storage adapter chunks values below the documented historical
  per-item-size limit; it is not a general application database.
- `@react-native-async-storage/async-storage`: small, non-sensitive
  key/value preferences. It is unencrypted and must not store credentials.
- `expo-sqlite`: structured local relational data/cache if an approved feature
  needs it. It is not the server-of-record and does not replace PostgreSQL.

These are distinct capabilities, not interchangeable persistence choices.

## Development build, update, and fingerprint policy

- JavaScript/TypeScript-only changes can run in the existing compatible
  development client through Metro or a published EAS Update; they do not
  require rebuilding native code.
- A changed native dependency, Expo SDK/native framework version, config
  plugin, or native app configuration changes the native fingerprint and
  requires a new development build.
- `runtimeVersion.policy: "fingerprint"` is configured so native-incompatible
  runtimes cannot receive updates targeting another fingerprint. Compare the
  current platform fingerprint with successful development builds before
  publishing or creating a cloud build; reuse a matching build.
- EAS Update is enabled for the linked project at
  `https://u.expo.dev/f38b01f9-f946-4d79-a4c5-2927f2622487`. The precise
  fingerprint, build lookup, update, and physical-device workflow is in
  [`EAS_WORKFLOW.md`](./EAS_WORKFLOW.md).
- iOS and Android native folders are generated outputs. Change Expo config or
  supported config-plugin inputs, regenerate with Expo tooling, and never
  hand-edit or commit `ios/` or `android/`.

## EAS build profiles

- `development`: internal distribution of a custom development client for
  physical devices, using EAS environment `development`. It is not pinned to a
  channel: development clients can preview compatible updates from other
  channels, and `Updates.channel` is null in development clients.
- `development-simulator`: iOS Simulator development client, extending the
  development profile with simulator output enabled.
- `preview`: internal, production-like stakeholder build on channel/environment
  `preview`.
- `production`: channel/environment `production`; store signing and submission
  credentials remain deliberately unconfigured.

Phase 14 created one successful physical iOS development build and installed
it on the registered iPhone. Its fingerprint/runtime is recorded in the
completed Phase 14 execution plan along with the compatible development OTA
proof. Phase 10's existing internal iOS signing/provisioning, EAS project
identity, and APNs key were reused.

The current iOS bundle identifier is `com.unimate.ios`; the Android package
remains `com.unimate.app`. Reuse the existing EAS project identity and push key;
do not change the Android package as a side effect.

For approved physical development networking, the local API remains bound to
loopback port 3000 and local Supabase remains on loopback port 55321. Tailscale
Serve exposes the API at the Mac's private `.ts.net` HTTPS origin, Supabase on
the same private hostname at port 8443, and Metro at port 8081. All routes are
tailnet-only; Funnel, PostgreSQL, and PGMQ are not exposed. The ignored
`apps/mobile/.env` supplies these development-only origins. Signed local
Storage capabilities are rewritten to that configured HTTPS Supabase origin;
production URL behavior is unchanged. Metro remains a separate development
server behind its own private Serve listener.

EAS Update hosts the JavaScript bundle and assets, not the API or database.
Until those services are hosted, physical-device data/auth still needs the Mac
and phone connected to Tailscale. Tailscale Serve exposes only the approved API
and Supabase HTTP gateways; PostgreSQL and PGMQ remain loopback-only.

## Adding or changing a native dependency

Before proposing a new native package, an agent must:

1. Check this inventory for an installed capability that already solves the
   need.
2. Confirm the dependency is necessary for an approved UniMate requirement.
3. Use `pnpm expo install <package>` or the current Expo-compatible installer
   and confirm SDK compatibility.
4. Update this inventory with its runtime effect, purpose, and configuration
   or permission requirements.
5. State whether the native fingerprint changes and whether a development
   build must be rebuilt; native runtime changes require a rebuild.

Run `pnpm --filter @unimate/mobile exec expo install --check` during this
dependency workflow. It normally fetches SDK version recommendations from Expo,
so it is not part of canonical `pnpm verify`. The installed CLI's
`EXPO_OFFLINE=1` fallback uses local SDK metadata but warns that offline
dependency validation is unreliable; do not treat it as equivalent evidence.

The import boundary preventing mobile access to database/server code is
enforced by the central ESLint configuration. More specific provider-adapter
rules should be extended when those implementations are introduced.

## Environment boundary

Expo may use `EXPO_PUBLIC_API_URL` to override the local API address, as
documented in `apps/mobile/.env.example`. A physical device needs an address
reachable from that device, such as a LAN or tunnel URL.

Values using `EXPO_PUBLIC_*` are embedded in the client and are public. Never
put server secrets in Expo public variables; keep future secrets in server/EAS
secret configuration.
