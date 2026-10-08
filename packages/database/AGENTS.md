# Database Package Guidance

- Read [`docs/engineering/DATABASE.md`](../../docs/engineering/DATABASE.md) before changing persistence architecture.
- Prisma owns the PostgreSQL `app` schema and all application migrations; never use `prisma db push` as the schema workflow.
- Commit and review migrations. Do not edit generated Prisma Client files.
- If Prisma cannot express a required CHECK constraint or partial index, use `prisma migrate dev --create-only`, review the generated SQL, and make the smallest necessary SQL edit before applying the migration. Committed/shared applied migrations are immutable; use a forward migration for later changes.
- Persist IDs as native UUIDs with Prisma UUIDv7 defaults and absolute instants as `timestamptz`.
- Keep relationships relational; use JSONB only for opaque/versioned snapshots such as outbox payloads.
- After adding or removing models, search for and update physical schema inventory assertions and snapshots.
- When adding a migration, prove migration-from-zero with the loopback-protected reset workflow.
- The `test:integration:prepared` script assumes Prisma generation and package build have already passed; use `pnpm db:test` for a self-contained run.
- Run database integration tests against real PostgreSQL, never SQLite.
