# Authorization Package Guidance

- The capability catalogue is code-defined and contains exact keys only.
- Keep this package independent of NestJS, Prisma/database, Supabase, contracts, Expo, React Native, and application modules.
- Adding a capability requires a scope definition and focused tests.
- Never add wildcard or prefix-based grants.
