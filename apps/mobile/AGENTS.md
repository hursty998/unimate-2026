# UniMate Mobile Agent Guide

## Sources of truth

- The repository-root `AGENTS.md` applies here.
- Native dependency inventory and rebuild policy: [`docs/engineering/NATIVE_RUNTIME.md`](../../docs/engineering/NATIVE_RUNTIME.md).
- Use installed official Expo skills and `agent-device` guidance for current framework and device workflows.

## Working directory

- Run Expo/EAS commands that resolve app configuration or project files, including EAS config and project inspection, from `apps/mobile`.
- From the repository root, use `pnpm --filter @unimate/mobile ...` when invoking an existing mobile package script. For one-off CLI commands, use a workspace-scoped invocation only when its working directory is known to be `apps/mobile`.
- Do not assume a command will resolve the Expo project correctly from the monorepo root merely because pnpm manages the workspace.

## Metro

- Before starting Metro on port 8081, check whether a healthy Expo/Metro server is already listening; when appropriate, query `http://localhost:8081/status` and look for `packager-status:running`.
- A healthy status response alone does not establish which checkout owns the server. Check its process/worktree context when needed, and reuse it when it belongs to this checkout.
- Do not start a duplicate server just because a validation command asks for one. If the existing server is stale or belongs to another checkout, diagnose it before taking action; do not assume a port identifies a process that is safe to terminate.
- For iOS/Android QA, use the `dev` script rather than the web-target `web` script; an installed development client can otherwise keep showing a cached bundle. Reconnect with an explicit Metro host/port and verify the changed UI on-device before accepting the runtime result.

## Verification

- For mobile-facing changes, use `agent-device` with the iOS Simulator or Android emulator when available and inspect the running UI; a successful build alone is not runtime verification. Specify the platform when concurrent device sessions could make a command ambiguous.
- For Expo web UI changes, use the VS Code integrated browser for exploratory visual verification. HTTP 200 or static-export checks do not replace a requested visual browser check.

## Native projects

- `ios/` and `android/` are generated, ignored CNG output. Do not hand-maintain them; make native capability changes through Expo config/plugins and follow the native-runtime policy.

## Mobile tool selection

- Use `agent-device` by default for device QA: accessibility inspection, interaction, cross-platform checks, physical-device interaction where supported, screenshots, logs/crashes, performance/React profiling, and replayable journeys.
- Use the opt-in local Expo MCP (`dev:mcp`) for Expo-specific tasks such as router sitemap, React Native DevTools, or convenient testID/view inspection and targeted screenshots. It is iOS-simulator-only; do not use it as the physical-device verifier or drive the same simulator concurrently with `agent-device` without a clear reason.
- Use the remote Expo MCP for current Expo documentation and supported EAS project/build/account operations.
- Use Xcode MCP, when available, for iOS project/build/run/destination/settings/signing and native diagnostics. For native compatibility failures, test the same installed major iOS Simulator runtime as the target device when practical before another device build.
- Keep Expo config/CNG as the native source of truth; never hand-maintain generated `ios/`. If an MCP lacks an operation, use supported machine-readable or non-interactive CLI commands. Never automate interactive credential menus with PTY, keystrokes, or prompt scraping.
