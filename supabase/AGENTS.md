# Supabase Project Guidance

- The repository-root guidance applies. Supabase is local/provider infrastructure, not UniMate application data access.
- Prisma owns UniMate application tables and migrations in PostgreSQL schema `app`; do not duplicate them in `supabase/migrations` or declarative schemas.
- Keep `app` out of the Supabase client Data API exposed schemas.
- Do not link to or run destructive operations against a hosted Supabase project without explicit user instruction.
- Prefer this repository's configured Supabase MCP for Supabase documentation/context; its local endpoint uses port `55321`, not the default `54321`. If it fails to initialize, do not retry the same call unchanged; fall back to official docs or the CLI.
- For local runtime/provider diagnostics, use `supabase status -o json` for the current project's API and database URLs rather than guessing ports or environment inheritance.
