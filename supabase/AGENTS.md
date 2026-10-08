# Supabase Project Guidance

- The repository-root guidance applies. Supabase is local/provider infrastructure, not UniMate application data access.
- Prisma owns UniMate application tables and migrations in PostgreSQL schema `app`; do not duplicate them in `supabase/migrations` or declarative schemas.
- Keep `app` out of the Supabase client Data API exposed schemas.
- Do not link to or run destructive operations against a hosted Supabase project without explicit user instruction.
