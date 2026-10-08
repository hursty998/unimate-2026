# Coding Agent Workflow

Keep agent context focused and make repository knowledge progressively
discoverable.

## Repository legibility

- Root [`AGENTS.md`](../../AGENTS.md) is a high-signal map, not an encyclopedia.
- Canonical architecture and engineering decisions belong in
  [`ARCHITECTURE.md`](./ARCHITECTURE.md) and the relevant engineering document.
- Put path-specific rules in the nearest `AGENTS.md`.
- Use Skills for reusable procedures whose detail should load only when relevant.

## Normal coding loop

```text
task
-> inspect relevant docs and code
-> focused implementation
-> focused verification
-> verify:changed where useful
-> runtime/UI inspection when relevant
-> retrospective
-> persist durable improvements if any
-> focused verification of persisted improvements
-> one final pnpm verify on the final working tree
-> final diff review
-> handoff
```

Use the smallest useful test loop while implementing. Run
`pnpm verify:changed` when its affected-task feedback is useful, then run
the retrospective before the final full verification if the task is substantial.
After any retrospective changes, verify them narrowly, then run exactly one
canonical `pnpm verify` on the final working tree. Do not run another
retrospective after that final verify.

Use `pnpm verify:verbose` when live child output is needed. Inspect browser/native
runtime only when the change affects that runtime. If final verification finds
a normal implementation failure, fix it, rerun its focused check, and rerun
final verification. If it reveals only a new non-blocking agent-process lesson,
defer it to a later deliberate retrospective/harness pass rather than starting
another self-improvement cycle.

## Retrospective and self-improvement

Every substantial implementation, refactor, or debugging session should review
recurring friction before handoff. Persist a lesson only if it is repository-
specific, likely to recur, useful, architecture-consistent, and cheaper to keep
than rediscover.

Prefer mechanisms in this order:

```text
test/lint/script
-> canonical engineering documentation
-> nearest nested AGENTS.md
-> root AGENTS.md
-> focused Skill
```

Zero permanent changes is a valid result. See the
[UniMate retrospective Skill](../../.agents/skills/unimate-retrospective/SKILL.md)
for the evidence review and durability gate.

## Instruction and Skill hygiene

- Merge or prune stale guidance; do not add duplicate or one-off rules.
- Keep context cheap and point to canonical sources rather than copying them.
- Keep Skill descriptions short and narrow; put detailed procedure in the body.
- Do not casually edit or fork vendor-installed Skills. Check their source and
  supported targeted update mechanism first.
- Prefer deterministic checks over prose. Add a general Markdown-reference
  checker only when it can use a real parser without fragile allowlists or
  partial Markdown parsing; current owned references are checked during edits.

## Hooks

Do not add semantic self-improvement hooks. Retrospective decisions require
judgement and belong in the Skill. Consider hooks later only for deterministic
lifecycle or security automation when the active coding environment supports
them reliably.

## Existing and future harness

The current baseline already includes `pnpm verify`, `pnpm verify:changed`,
`pnpm verify:verbose`, bounded failure summaries with full logs, architecture
checks, the `AGENTS.md` hierarchy, and the retrospective Skill. Phase 12 should
build on this baseline rather than recreate it. Candidate later work includes
periodic guidance/documentation pruning, freshness checks, test/debt quality
reporting, machine-readable verification results, and additional deterministic
architecture constraints when real patterns emerge. Add agent evaluations only
after enough real tasks exist to make them meaningful.

Before production deployment packaging, use build-specific TypeScript
configurations where needed to exclude tests and test-support code from runtime
artifacts while preserving test and typecheck coverage. This is deployment
preparation, not a reason for a foundation-wide build restructure now.

Expo's default `expo install --check` obtains SDK recommendations from Expo's
remote versions endpoint. `EXPO_OFFLINE=1` uses the installed SDK's bundled
version map, but the installed CLI warns that offline dependency validation is
unreliable. Keep this compatibility check in the mobile/native dependency
workflow, not canonical `pnpm verify`.
