# UniMate

UniMate is a university community application. This repository establishes its
engineering foundation; product-domain features are not yet implemented.

## Current engineering foundation

- Expo SDK 57 mobile application for iOS, Android, and web.
- NestJS 12 API using Fastify.
- Shared, contracts-first oRPC and Zod API definitions.
- PostgreSQL with Prisma ORM 7; Prisma owns application migrations in schema
  `app`.
- Supabase is the initial local/development infrastructure provider and Auth
  service. Mobile uses Supabase for Auth only; application data goes through
  the API.
- The API verifies asymmetric Supabase JWTs locally and maps provider identity
  to a provider-neutral UniMate User. Authorization uses exact capabilities
  and scoped relational grants; it is deny-by-default.
- Replaceable server-side seams now cover object storage, queueing, push
  delivery, and telemetry; their boundaries and initial adapters are described
  in [Provider boundaries](./docs/engineering/PROVIDERS.md).
- pnpm workspaces and Turborepo coordinate package tasks.

## Repository map

- [`apps/mobile/`](./apps/mobile/) — Expo application.
- [`apps/api/`](./apps/api/) — NestJS/Fastify API.
- [`apps/worker/`](./apps/worker/) — reserved workspace; no worker implementation
  yet.
- [`packages/contracts/`](./packages/contracts/) — shared API contracts.
- [`packages/database/`](./packages/database/) — Prisma schema, migrations, and
  database tooling.
- [`packages/auth/`](./packages/auth/) — provider-neutral token-verification
  contract and Supabase JWT adapter.
- [`packages/authorization/`](./packages/authorization/) — capability catalogue.
- [`packages/storage/`](./packages/storage/), [`packages/queue/`](./packages/queue/),
  [`packages/notifications/`](./packages/notifications/), and
  [`packages/observability/`](./packages/observability/) — provider ports and
  initial adapters.
- [`packages/eslint-config/`](./packages/eslint-config/) and
  [`packages/typescript-config/`](./packages/typescript-config/) — shared tooling.
- [`docs/engineering/`](./docs/engineering/) — canonical engineering guidance.
- [`docs/exec-plans/`](./docs/exec-plans/) — active and completed foundation plans.
- [`.agents/skills/`](./.agents/skills/) — installed vendor Skills and
  UniMate-owned agent workflows.

## Getting started

Use Node.js `24.14.0` and pnpm `10.33.0` from
[`.node-version`](./.node-version) and the root `package.json`.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm db:start
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Before database/API/mobile commands, configure the required local environment
files from their examples. Follow [Database](./docs/engineering/DATABASE.md) and
[Authentication](./docs/engineering/AUTHENTICATION.md) for the safe local setup;
do not put server secrets in Expo public variables.

## Verification

- `pnpm verify:changed` runs formatting, tooling tests, and affected workspace
  checks for fast feedback; it does not run provider/database integrations.
- `pnpm verify` runs complete repository validation, including local integration
  checks and the changed-file credential scan (`pnpm secrets:check`).
- `pnpm verify:verbose` runs the complete suite and streams child output live.

## Architecture documentation

- [Architecture](./docs/engineering/ARCHITECTURE.md)
- [Engineering principles](./docs/engineering/ENGINEERING_PRINCIPLES.md)
- [Database](./docs/engineering/DATABASE.md)
- [Authentication](./docs/engineering/AUTHENTICATION.md)
- [Authorization](./docs/engineering/AUTHORIZATION.md)
- [Provider boundaries](./docs/engineering/PROVIDERS.md)
- [Native runtime](./docs/engineering/NATIVE_RUNTIME.md)
- [Agent workflow](./docs/engineering/AGENT_WORKFLOW.md)
- [Agent guide](./AGENTS.md)
