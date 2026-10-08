# Database Package Guidance

- Read [`docs/engineering/DATABASE.md`](../../docs/engineering/DATABASE.md) before changing persistence architecture.
- Prisma owns the PostgreSQL `app` schema and all application migrations; never use `prisma db push` as the schema workflow.
- Commit and review migrations. Do not edit generated Prisma Client files.
- Persist IDs as native UUIDs with Prisma UUIDv7 defaults and absolute instants as `timestamptz`.
- Keep relationships relational; use JSONB only for opaque/versioned snapshots such as outbox payloads.
- Add raw SQL only when Prisma cannot express a required database invariant; parameterize and test it.
- Run database integration tests against real PostgreSQL, never SQLite.
