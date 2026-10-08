# Phase 3 — API + Shared Contract Foundation

**Status:** Complete
**Completed:** 2026-10-08

## Objective

Prove the Expo → TanStack Query → typed oRPC client → shared contract → NestJS/Fastify → application service boundary using static in-memory data only.

## Decisions

- Runtime: Node 24.14.0, pnpm 10.33.0, Expo SDK 57.0.27, TypeScript 6.0.3.
- NestJS: `@nestjs/common`, `@nestjs/core`, and `@nestjs/platform-fastify` 12.1.2. Fastify 5.12.5 is a direct, exact-pinned API dependency and the adapter/orpc peer resolves to that version.
- Stable oRPC v1.15.5: `@orpc/contract` (contracts), `@orpc/nest`, `@orpc/server`, `@orpc/openapi`, and `@orpc/zod` (API), plus `@orpc/client`, `@orpc/contract`, and `@orpc/openapi-client` (mobile). npm `latest` is v1.15.5; v2.0.0-beta.42 remains beta. Used the versioned v1 docs at `https://v1.orpc.dev/` and the v1 playground branch, not v2/beta examples.
- Zod: 4.6.5; OpenAPI uses the v4 converter from `@orpc/zod/zod4`. TanStack Query: 5.104.1. Other API runtime dependencies: `reflect-metadata` 0.2.2 and `rxjs` 7.8.2. API type tooling: `@types/node` 24.19.1.
- Tests use Node's built-in test runner; no Jest, Vitest, Nest CLI, bundler, or native dependency was added.

## Architecture

- `packages/contracts` is the handwritten Zod/oRPC semantic API. Node/Nest loads compiled NodeNext ESM from ignored `dist/`; the explicit package export is consumed by Metro and TypeScript. No server, persistence, provider, or mobile imports belong in contracts.
- `apps/api` uses NestJS 12, Fastify, stable `@orpc/nest` `ORPCModule`/`@Implement`, strict TypeScript, and NodeNext ESM. The system feature has a thin transport controller and an injectable static in-memory service. The public `GET /v1/system/health` returns a deterministic contract response. Startup validates `API_HOST`, `API_PORT`, `NODE_ENV`, and `API_CORS_ORIGINS` with Zod. Development CORS permits localhost/loopback origins; production accepts only explicitly configured origins. CORS explicitly supports GET, HEAD, POST, PUT, PATCH, DELETE, and OPTIONS. The stable Nest setup disables Nest body parsing while Fastify handles the request.
- The single QueryClient is created at the mobile root provider. A typed `OpenAPILink` from `@orpc/openapi-client/fetch` calls the shared contract; TanStack Query owns the health state. `@orpc/tanstack-query` was intentionally omitted because directly wrapping this one typed call with `useQuery` avoids an unnecessary adapter.
- API URL override: `EXPO_PUBLIC_API_URL`; defaults are `http://127.0.0.1:3000` on web/iOS Simulator and `http://10.0.2.2:3000` on Android Emulator. Physical devices need a reachable LAN/tunnel/preview override.
- `pnpm openapi:generate` derives `docs/generated/openapi.json` from the same contract. The output is ignored, deterministic, and never an internal client-generation input.
- Turbo caches package-relative `dist/**` outputs for the API, contracts, and Expo web build, builds contracts before consumers, and starts contracts/API TypeScript watchers from `pnpm dev`; app-specific Turbo configuration avoids starting those watchers in unrelated packages.

## Verification

- Five API tests pass: direct contract-procedure output validation, Fastify HTTP injection, invalid environment rejection, documented defaults, and CORS preflight method/origin behavior. The HTTP test verifies status, JSON content type, and response shape.
- Central ESLint rules protect contract/mobile/API import boundaries. Strict typecheck/build pass for contracts, API, and mobile.
- `pnpm install --frozen-lockfile`, `pnpm verify` (including OpenAPI generation), `pnpm openapi:generate`, `pnpm verify:changed`, `git diff --check`, and `pnpm git-diff` all pass.
- Raw HTTP returns 200 and the contract response. The VS Code integrated browser displayed connected status/service/version and navigated to/from validation; no fatal console error was observed (one non-fatal Expo Router aria-hidden focus warning appeared on navigation).
- Existing iPhone 16 Simulator development build displayed API success and navigated to/from validation. Existing Pixel 3a API 34 emulator displayed API success/service/version and navigated to/from validation. Both used the running Metro server; no native rebuild or EAS build was used.

## Deviations and evidence

- No scope or architecture deviations. The first iOS device selections did not have the existing app installed; verification completed on the iPhone 16 Simulator where the Phase 2 development build was already installed.
- Android agent-device session cleanup reported an adb timeout after verification and deleted the session; API/app runtime verification had already passed and the dev processes were stopped cleanly.
