# Phase 1 — Monorepo Scaffold

**Status:** Complete  
**Started:** 2026-10-07

## Objective

Establish UniMate's private pnpm workspace, Turborepo task graph, shared TypeScript and ESLint configurations, repository-wide formatting and hygiene, and root developer commands. Do not scaffold application frameworks or product/domain code.

## Current state

- Git repository confirmed on branch `development`; working tree was clean before Phase 1 changes.
- Node.js `24.14.0` and pnpm `10.33.0` are installed.
- No package manifest, workspace, application scaffold, or product implementation exists.
- `docs/engineering/ENVIRONMENT_REPORT.md` still says the directory is not a Git checkout; this is stale and will be corrected factually.

## Implementation steps

1. Record the current stable tooling versions and compatibility constraints.
2. Add root package metadata, pnpm workspace configuration, exact-version policy, and lockfile.
3. Add private manifests for the planned app and infrastructure package boundaries without runtime placeholders.
4. Configure Turbo tasks and shared TypeScript/ESLint packages.
5. Add formatting, Git/environment hygiene, concise repository guidance, and the Phase 1 validation plan.
6. Install dependencies, validate workspace/task discovery, run the required quality commands, update this plan, and move it to completed only if acceptance criteria pass.

## Important decisions

- Keep Node.js `24.14.0` and pnpm `10.33.0`; record them in repository metadata rather than upgrading them.
- Select exact stable tooling releases from the npm registry. `typescript-eslint@8.71.1` supports TypeScript `<6.1.0`, so use stable TypeScript `6.0.3` rather than the registry's newer TypeScript `7.0.2`.
- Keep all apps and domain/infrastructure packages private and free of placeholder source code.
- Keep the shared TypeScript base strict and typecheck-only; leave `module` and `moduleResolution` to later Expo/Node-specific configurations.
- Use ESLint flat config with a central baseline and leave architectural import restrictions for later implementation phases.
- Use Prettier with minimal shared settings; keep vendored skills and agent-managed guidance excluded.
- Leave Turbo build outputs unspecified until real build targets exist; make development tasks persistent and uncached.
- Use Turbo's documented `--affected` mode for `verify:changed`; it is stable in Turbo `2.11.7`, while its default base-branch assumption will be checked against this checkout.

## Versions selected

- Node.js: `24.14.0`
- pnpm: `10.33.0`
- Turbo: `2.11.7`
- ESLint: `10.12.0`
- `@eslint/js`: `10.0.1`
- `typescript-eslint`: `8.71.1`
- TypeScript: `6.0.3`
- Prettier: `3.9.9`

The npm registry reports TypeScript `7.0.2` as the latest stable release, but `typescript-eslint@8.71.1` supports TypeScript `<6.1.0`. TypeScript `6.0.3` is the latest stable compatible release checked. The tool packages are pinned exactly; `.npmrc` enables pnpm's built-in `save-exact` behavior.

## Final implementation decisions

- `apps/*` and `packages/*` are pnpm workspaces; all 14 workspaces are private and use `@unimate/*` names.
- Empty app/domain packages contain only manifests. No fake test, build, typecheck, or dev scripts were added.
- `turbo.json` defines dependency-aware build/lint/typecheck/test tasks and an uncached persistent dev task. Build outputs are intentionally omitted until actual output paths exist.
- The root lint task runs the reusable flat ESLint baseline. It enforces TypeScript unused-variable and explicit-`any` rules plus duplicate-import hygiene.
- The shared TypeScript config is JSONC, strict, targets ES2022, disables emit and JavaScript input, and leaves module/module-resolution choices to later runtime-specific configs.
- `verify:changed` uses Turbo `--affected` (confirmed in the installed `2.11.7` docs) plus a repository-wide Prettier check. The affected Turbo run passed on the current checkout without a base override.
- Prettier ignores vendored skills, generated artefacts, the package lock, and agent-managed `AGENTS.md`; canonical engineering documentation is included in formatting checks.
- No `.env.example` was created because no environment variables exist yet. README documents the committed-example/local-secret/public-vs-server convention.
- The canonical GitHub repository is `hursty998/unimate-2026`; the local `origin` URL was corrected from the earlier repository name without changing branch contents or history.
- `pnpm git-diff` includes a generated warning before displaying potentially sensitive uncommitted file contents.

The final Phase 1 tidy-up confirmed the existing `development` branch and HEAD remained unchanged, added the git-diff sharing warning, and brought canonical engineering docs into Prettier checks. Final `pnpm verify` passed, including the four Git-diff utility tests.

## Validation results

| Command/check                                              | Result                                                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                                             | PASS                                                                                                          |
| `pnpm install --frozen-lockfile`                           | PASS; lockfile was current                                                                                    |
| `pnpm format:check`                                        | PASS                                                                                                          |
| `pnpm lint`                                                | PASS; root and ESLint-config package lint tasks ran                                                           |
| `pnpm typecheck`                                           | NOT APPLICABLE; no workspace typecheck scripts or source exist                                                |
| `pnpm build`                                               | NOT APPLICABLE; no workspace build scripts or outputs exist                                                   |
| `pnpm test`                                                | NOT APPLICABLE; no tests or test scripts exist                                                                |
| `pnpm dev`                                                 | NOT APPLICABLE; no app development servers exist                                                              |
| `pnpm verify:changed`                                      | PASS; formatting and two affected lint tasks ran                                                              |
| `pnpm verify`                                              | PASS; formatting and lint passed; build/typecheck/test had no workspace scripts                               |
| pnpm workspace listing                                     | PASS; all 14 intended private workspaces are visible                                                          |
| Turbo workspace/task inspection                            | PASS; Turbo `2.11.7` recognizes the workspace and configured root lint task                                   |
| Exact-version/scope audit                                  | PASS; all external direct dependency versions are exact and no later-phase framework dependencies are present |
| TypeScript config parser check                             | PASS; strict options, no emit, ES2022 target, and runtime-neutral module settings verified                    |
| ESLint in-memory rule probe                                | PASS; duplicate imports, explicit `any`, and unused variables are rejected                                    |
| Direct `tsc --showConfig` against the empty config package | NOT APPLICABLE; TypeScript reports no input files, as no placeholder source is added                          |

## Deferred work

Expo, NestJS, oRPC/Zod, Prisma, Supabase project configuration, authentication, RBAC implementation, storage, queue implementation, push notifications, and observability remain for their later foundation phases.

## Validation commands

Run and record each result separately:

```text
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm verify
pnpm verify:changed
pnpm list --recursive --depth -1
pnpm exec turbo ls
```

Also inspect dependency ranges, generated files, workspace membership, and the final scoped Git diff. Report framework/build/test commands with no current workspace scripts as having no substantive work, not as test coverage.

## Acceptance criteria

- pnpm workspace and lockfile are valid and reproducible.
- Turbo recognizes the intended workspaces and task graph.
- All specified apps/packages exist as private workspaces.
- Shared TypeScript and ESLint configurations and Prettier commands are usable.
- Direct dependencies are exact; pnpm and Node expectations are recorded.
- Root quality commands do not fake successful checks.
- Environment and Git hygiene, root README, and this plan are in place.
- No Expo, NestJS, Prisma, Supabase project, authentication, or product/domain implementation has begun.
- `pnpm verify` passes, and all required validation results are reported accurately.

## Deviations discovered

- The environment report was accurate when written, but the workspace is now an initialized Git checkout on `development`; the report was updated factually. Git was not initialized and no history was rewritten as part of this task.
- Turbo `2.11.7` automatically added its managed agent-guidance block to `AGENTS.md` when running repository-scoped commands; the relevant generated guidance is retained.
