# Browser and native smoke testing

Phase 13 smoke flows prove the Foundation app can authenticate against local
Supabase, call the real API, provision/read a UniMate identity in PostgreSQL,
and sign out. They are not product journeys, visual-regression tests, or
replacements for unit/integration verification.

## Browser

- Use the VS Code integrated browser for visible, interactive exploration.
- Playwright MCP is not part of the smoke workflow. Run `pnpm smoke:web` for
  durable Chromium regression.
- Before using an interactive browser control for login, verify that its action
  results and snapshots mask password fields. Do not read or echo field values;
  stop if the browser tool exposes a password in its output.
- The command requires the current local Supabase stack and Prisma migrations;
  it checks them, builds and starts its own API on `127.0.0.1:3013`, and starts
  its own Expo web server with explicit local endpoints and the local
  publishable key. The API is bound to the already-validated local PostgreSQL
  and Supabase endpoints. If the dedicated API or web port is occupied, it
  fails without reusing or stopping another process. It verifies the API
  listener belongs to the exact child process it started and stops only that
  API process.
- The test starts with empty browser storage, enters a generated confirmed
  `example.test` account through the Foundation UI, waits for `getMe` to render
  the UniMate ID, and signs out. The Foundation form clears its temporary
  email/password after sign-out and clears the password immediately on sign-in.
- A local-only fixture creates the Supabase Auth user and removes its
  corresponding UniMate identity/user, if present, in `finally` cleanup.
  Failures retain Playwright screenshots/traces under the OS temporary
  directory; successful runs discard their output.

## Native

- For new Mac/iPhone pairing, Apple development signing, and physical
  `agent-device` setup, see [`IOS_DEVICE_SETUP.md`](./IOS_DEVICE_SETUP.md).
- Use `agent-device` as the interaction, accessibility, screenshot, and log
  driver on the visible iOS simulator GUI and Android emulator. On Xcode 27,
  the iOS simulator GUI is DeviceHub rather than `Simulator.app`; open DeviceHub
  and keep the booted iPhone 17 visible. Use the existing iOS 27 runtime and
  configured Android AVD; do not rebuild a compatible development client.
- Start the API and Metro only after checking port ownership. Metro must use
  simulator-local networking: blank `EXPO_PUBLIC_API_URL` and
  `EXPO_PUBLIC_SUPABASE_URL` so iOS uses loopback and Android uses `10.0.2.2`.
  Supply `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from local
  `supabase status -o json`. If port 8081 belongs to another service (for
  example, Tailscale), keep that process untouched and use another free Metro
  port. Never edit the ignored physical-device `apps/mobile/.env`.
- Prepare one temporary synthetic identity with
  `pnpm smoke:fixture:create`; the command prints only a mode-0600 credential
  file path under the OS temporary directory. Use it for both platforms, sign
  out through the app, then run `pnpm smoke:fixture:cleanup -- <path>`. Cleanup
  removes an app identity if `getMe` created one, the Auth user, and the
  credential file. Retry cleanup if it reports failure.
- On each platform prove launch, API connectivity, signed-out state, synthetic
  UI sign-in, `API identity: connected`, rendered UniMate user ID, and UI
  sign-out. Keep the simulator/emulator GUI visible throughout.

## Tool precedence

- VS Code integrated browser: interactive web QA.
- Playwright test runner: committed durable web regression.
- `agent-device`: native operation and evidence.
- Xcode MCP: iOS-native diagnosis only.
- Expo MCP: Expo-specific diagnostics only.

## Security

Fixtures are synthetic, unique `example.test` users restricted to the local
Supabase API and the PostgreSQL endpoint reported by the local Supabase CLI.
Hosted endpoints, real credentials, and hosted mutations are out of scope.
Real/reusable credentials and server secrets must never be exposed or committed.
The local secret key is used only by the Node fixture/API processes; it is never
sent to Expo/browser clients or written to fixture files, screenshots, traces,
or normal output. Synthetic passwords are ephemeral, stored only in private
temporary files when needed, and cleaned with their accounts. Avoid displaying
even synthetic passwords through interactive tooling. A failure trace may
include synthetic-only browser interaction data; keep it in the OS temporary
directory and remove it after diagnosis.

## Deferred

- Physical-device distribution and EAS Update: Phase 14.
- CI: Phase 15.
- Full product-journey end-to-end coverage: later product implementation.
