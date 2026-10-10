# Local Verification

This document is the source of truth for the local verification runner and its
lanes. Keep agent workflow sequencing in
[`AGENT_WORKFLOW.md`](./AGENT_WORKFLOW.md).

## Commands

- Focused checks: run the package/module lint, typecheck, build, or test command
  for the changed code. `pnpm test:tooling` runs the verification and
  architecture tooling tests directly without invoking the verification runner.
- `pnpm verify:changed` runs format checking, tooling tests, and affected
  Turbo lint, typecheck, build, and tests.
- `pnpm verify` runs the complete local gate described below.
- `pnpm verify:verbose` runs the same full gate while streaming successful
  child output.
- `node scripts/verify.mjs --report-json <path>` writes a versioned JSON result.
  Add `--changed` and/or `--verbose` to combine modes. Schema version 1 includes
  `schemaVersion`, `mode`, `status`, `durationMs`, and `steps`; each step has a
  name, status, duration, and exit code. Failed runs add `failedStep` and, when
  available, `failureLogPath`. Reports are written only to the requested path
  and are not archived. The report never embeds child output; report write
  failures are explicit and non-zero.
- Standalone local integration commands include `pnpm db:test`,
  `pnpm auth:test`, `pnpm storage-proof:test`, `pnpm push:test`,
  `pnpm authorization:test`, `pnpm providers:test`, `pnpm worker:test`, and
  `pnpm observability:test`.

## Full and changed lanes

The full runner is sequential and currently has 14 steps:

1. formatting;
2. tooling tests;
3. secret scanning;
4. Turbo lint, root lint, typecheck, build, and unit tests;
5. non-mutating OpenAPI consistency check;
6. database schema and migration check;
7. database integration;
8. authentication integration;
9. storage-proof integration;
10. push-registration integration;
11. authorization integration;
12. provider integration;
13. worker integration;
14. observability integration.

`verify:changed` intentionally stays small and has three steps: formatting,
tooling tests, and affected Turbo lint, typecheck, build, and tests. It does
not scan secrets, access PostgreSQL/Supabase, or run provider/integration,
browser, device, or native-build work. Phase 13 browser/native smoke stays in
its separate lane: see [`SMOKE_TESTING.md`](./SMOKE_TESTING.md) and run
`pnpm smoke:web` for the durable local browser flow.

Ordinary Node-test-runner package tasks recursively discover supported `.js`,
`.mjs`, and `.ts` test files in their normal test roots. They exclude
`*.integration.test.*` and `integration.test.*`; those remain in explicit
integration lanes. Mobile's existing direct Node TypeScript tests remain `.ts`
and `.mjs` only.

Root scripts ending in `*:test:prepared` are integration lanes. Tooling tests
assert that each is present exactly once in full verification and absent from
changed verification. The naming convention excludes prepared checks and
checks such as `db:check:prepared` and `openapi:check:prepared`.

Prepared commands are internal building blocks for canonical verification.
Choose their self-contained command counterparts for focused manual work unless
the required build, generation, and database preparation have already run.

## Failures and integration ordering

Successful child output is quiet by default. On failure, the runner prints a
bounded tail (up to 150 lines and 20,000 characters) and preserves the full
child log in the OS temporary directory. Successful verification removes its
temporary child logs. JSON reports contain no child log contents.

Canonical database/provider integrations run serially because they share local
fixtures. Run manually selected DB-backed integrations serially as well; no
cross-process lock is needed.

## Generated OpenAPI

`pnpm openapi:generate` explicitly regenerates
[`../generated/openapi.json`](../generated/openapi.json) from the shared
oRPC/Zod contract. `pnpm openapi:check` builds the API and compares the
deterministically serialized current document with that artifact without
writing it. A stale or missing artifact fails with the generation command.
Full verification uses check semantics after the canonical build.

## Adding verification

For a new local check, decide whether it belongs in focused, full, changed, or
an integration lane. Add a deterministic test for its contract, wire each
prepared integration lane into full verification exactly once, and update this
document when command or lane semantics change.

## Deferred

- Phase 13 owns browser and native smoke flows.
- Phase 14 owns EAS development workflows and native build distribution.
- Phase 15 owns CI and production deployment packaging.
- Agent evaluations wait for representative product-domain tasks.
- PostHog and product analytics remain separate from operational observability.
- No coverage/debt score or dashboard is produced; the per-run lane inventory is
  sufficient for the current foundation.
