# Database Architecture

## Ownership

PostgreSQL and Prisma ORM are intentional long-term UniMate architecture choices. Supabase is the initial local/development and hosting provider, not the domain data-access layer. PostgreSQL hosting may change without a domain-model rewrite.

Prisma alone owns UniMate application tables and migrations in the PostgreSQL `app` schema. Supabase owns provider infrastructure configuration. Do not maintain a second copy of application tables under `supabase/migrations` or declarative schemas. The `app` schema is deliberately absent from Supabase's exposed Data API schemas; mobile clients use the API, never direct table access.

## Prisma package and connections

`packages/database` is server-only and exposes a reusable Prisma Client factory using `@prisma/adapter-pg`. Callers create one client per process and close it with `$disconnect()`; the package does not keep a global singleton.

Prisma CLI, Client, and PostgreSQL adapter are exact-pinned to stable Prisma ORM 7.10.0. Prisma 8 release candidates are not used. Prisma's PostgreSQL URL is configured outside `schema.prisma` in `prisma7.config.ts`, passed explicitly with `--config`:

- `DATABASE_URL` is the runtime adapter connection and may later be pooled.
- All Prisma CLI operations that use the database configuration validate that `DIRECT_URL` is a PostgreSQL URL with exactly one `schema=app` parameter before proceeding; migration and migration-status commands therefore cannot silently target another schema.
- For local Supabase both use its direct local endpoint.

## Data conventions

- Foundation IDs use Prisma-generated UUIDv7 values stored as PostgreSQL `uuid`.
- Absolute instants use explicit PostgreSQL `timestamptz(6)` types.
- Prisma models and fields use PascalCase/camelCase; physical schema, table, and column names use `app`, snake_case plural tables, and snake_case columns.
- Users, identities, universities, and affiliations are relational. JSONB is reserved for the versioned opaque `OutboxMessage.payload`.
- The provider identity is opaque and unique by `(provider, providerSubject)`; it has no foreign key to Supabase `auth.users`.
- A `UniversityAffiliation` row denotes an established affiliation. Authentication alone does not imply one.
- Identity and affiliation rows cascade when their owning User is deleted. Deleting a University with affiliations is restricted.
- Stored-object rows restrict User deletion until the owning application flow has deleted provider bytes and metadata, preventing cascades from orphaning objects.
- The outbox has no dispatcher, retry, or queue implementation in this phase.
- Positive outbox payload versions are enforced with a minimal migration check constraint because Prisma 7's schema language cannot represent it.

## Migrations, seeds, and reset

Prisma schema and committed migrations live under `packages/database/prisma/`. Create intentional local migrations with `pnpm db:migrate --name <descriptive_name>`; deployment/CI applies committed migrations with `pnpm db:migrate:deploy`. Never use `prisma db push` for application schema changes.

Prisma 7 seeding is explicit. `pnpm db:seed` is idempotent and creates only synthetic development fixtures. `pnpm db:reset` is a destructive, loopback-only application reset: it uses `prisma migrate reset`, then explicitly runs the seed. Before either operation, it verifies that runtime and direct URLs use the same normalized effective hostname, port, and database name, including PostgreSQL `host`/`port` query overrides, and that the direct URL selects `app`. It rejects service/host-address overrides and does not equate different loopback hostname aliases. It must reset only `app`, preserving Supabase-owned schemas. It is not `supabase db reset`; the latter resets the whole local provider database and is not the application reset workflow.

## Verification

`pnpm db:check` validates the schema, regenerates the client, and checks migration status. `pnpm db:test` runs non-destructive integration tests against real local PostgreSQL, with unique test rows and targeted cleanup; it never resets the database. Ordinary tests remain independent of PostgreSQL. Full `pnpm verify` includes database checks/tests; `pnpm verify:changed` keeps its fast affected-task behavior and does not start or reset PostgreSQL.

Prisma-native schema features are preferred. Raw SQL is allowed only for a required invariant Prisma cannot express; keep it minimal, parameterized where applicable, and covered by PostgreSQL integration tests. Deployment systems apply committed migrations with `prisma migrate deploy`; hosted credentials and remote database operations are outside local Phase 4 setup.
