# Phase 4 — PostgreSQL + Prisma Foundation

**Status:** Complete  
**Started:** 2026-10-08  
**Completed:** 2026-10-08

## Decisions and implementation

- Exact pins: Prisma CLI, `@prisma/client`, and `@prisma/adapter-pg` 7.10.0; `pg` and `@types/pg` 8.23.1; `tsx` 4.23.15; `dotenv` 18.0.6; TypeScript 6.0.3; `@types/node` 24.19.1. Registry `latest` for Prisma CLI was 8.0.0-rc.21; no Prisma 8 release candidate is installed. Prisma 7 uses `prisma7.config.ts` explicitly with CLI `--config`.
- Local tools: Supabase CLI 2.104.0, PostgreSQL 17.6, Node 24.14.0, pnpm 10.33.0. Supabase is local/provider infrastructure; PostgreSQL and Prisma are permanent architecture choices.
- Prisma owns the application `app` schema and migrations in `packages/database/prisma/migrations/`. All database-targeting Prisma CLI operations using `prisma7.config.ts` validate `DIRECT_URL` as PostgreSQL with exactly one `schema=app` parameter. Supabase owns provider configuration only. No app schema is exposed in Supabase API schemas or duplicated in `supabase/migrations`; the Supabase seed is disabled.
- Runtime uses `DATABASE_URL` through `@prisma/adapter-pg` configured for schema `app`; Prisma CLI uses direct `DIRECT_URL` with `schema=app`. Local Supabase uses port 55322. The standard Supabase port block was held by a separate healthy local project (`xlcr-part-exchange`), which was preserved; UniMate uses ports 55320–55329.
- `packages/database` is ESM and exports only `createDatabaseClient`. Callers own one client per process and call `$disconnect()`; there is no package singleton. Prisma Client output is ignored at `src/generated/prisma`; package-specific Turbo tasks generate before build/typecheck.
- The only models are `User`, `AuthIdentity`, `University`, `UniversityAffiliation`, and `OutboxMessage`. IDs are Prisma UUIDv7/native UUID; instants are `timestamptz(6)`; relational data uses foreign keys and mapped snake_case names. JSONB is used only for the outbox payload.
- `AuthIdentity(provider, providerSubject)`, University slug, and `(userId, universityId)` are unique. `userId` foreign keys have useful indexes; user-owned identity/affiliation rows cascade on user deletion, and University deletion is restricted while affiliations exist. The outbox index is `(publishedAt, createdAt, id)`.
- Migration `20261008124953_foundation_identity_and_outbox` explicitly creates schema `app` and adds a tested `payload_version > 0` check. The minimal raw SQL is required because Prisma 7 schema language cannot express that check.
- The idempotent seed creates `unimate-development-university`, one synthetic affiliated Supabase identity, and one synthetic unaffiliated Supabase identity. It creates no outbox messages or Supabase Auth users.
- `pnpm db:reset` checks both effective URLs are loopback, requires the same normalized hostname/effective port/database name (including PostgreSQL `host`/`port` query overrides), and requires `DIRECT_URL` to select `app`; it rejects service/host-address overrides and different loopback hostname aliases, then runs Prisma `migrate reset` and explicitly runs Prisma 7 seed. It does not use `supabase db reset`.
- Real PostgreSQL integration tests use unique rows, clean up only those rows, and prove adapter connection, UUIDv7, relation queries, uniqueness constraints, unaffiliated users, JSONB, timestamp instants, physical types/schema, expected table set, and provider schemas.
- Connection safety is shared between Prisma CLI configuration and local reset: CLI operations require PostgreSQL `DIRECT_URL` with exactly one `schema=app`; reset also requires identical normalized effective hostname, port, and database name for its loopback runtime/direct URLs. Deterministic unit tests cover malformed/missing/wrong/duplicate schemas, protocol, loopback and IPv6, default ports, endpoint mismatches, and PostgreSQL URL target overrides.
- Full `pnpm verify` includes non-destructive DB status/integration checks. Ordinary `pnpm test` does not touch PostgreSQL. `pnpm verify:changed` remains affected/fast and does not reset or start PostgreSQL.

## Evidence

- `pnpm install --frozen-lockfile`, `pnpm format:check`, Prisma format, lint, typecheck, build, ordinary tests, `pnpm db:check`, `pnpm db:test`, `pnpm verify`, `pnpm verify:changed`, `git diff --check`, and `pnpm git-diff` all passed.
- Deleted the ignored generated Prisma Client and ran root `pnpm build`; Turbo recreated it before the database package build.
- `prisma migrate dev` created the initial migration; `prisma migrate deploy` found no pending migration. A loopback-only `prisma migrate reset` reapplied the migration from the app-schema reset and explicitly seeded it. The `auth` and `storage` schemas existed before and after; migration history is in `app`.
- Seed rerun twice produced exactly one expected University, two Users, two synthetic AuthIdentities, one affiliation, no outbox rows, and an unaffiliated external User.
- Integration tests and seed verification passed against local PostgreSQL 17.6. Final local database counts were `1|2|2|1|0` (University|Users|AuthIdentities|Affiliations|Outbox); provider schemas were `auth,storage`.
- `pnpm db:start` succeeded against the healthy stack without restarting its PostgreSQL container. The local Supabase stack remains running.

## Deviations

- Configured non-default local Supabase ports to avoid the existing unrelated project occupying the default ports. No unrelated container was stopped.
- No hosted project was linked or modified. No authentication, authorization, storage, queues, product-domain models, or native builds were introduced. No commit or push was made.
