---
name: unimate-retrospective
description: "Review a substantial completed UniMate coding, refactor, or debugging session for recurring friction. Use before handoff and persist only lessons that pass the durability gate."
---

# UniMate Retrospective

Use after implementation and verification, before handoff of substantial coding,
refactor, or debugging work. Skip trivial interactions and documentation-only
edits with no meaningful coding session.

Do not invoke this workflow recursively on its own implementation.

## 1. Review session evidence

Look for:

- failed commands or patches and retries;
- broad or repeated reads that added little value;
- stale or contradictory documentation;
- user corrections or misunderstood requirements;
- excessive output, context use, or duplicated verification;
- repeated manual steps;
- unclear ownership, boundaries, or source-of-truth locations;
- cheap checks that would have caught an issue earlier.

Ask what failed, what was retried, what was unclear, and whether the friction is
likely to recur. Separate observed evidence from speculation.

## 2. Classify each lesson

Choose the narrowest applicable category:

1. One-off or transient incident: do nothing.
2. Deterministic recurring failure: add or improve a test, lint rule, script, or
   check.
3. Durable architectural knowledge: update the canonical engineering document.
4. Path-specific coding constraint: update the nearest relevant `AGENTS.md`.
5. Universal, high-frequency rule: update root `AGENTS.md`.
6. Multi-step reusable procedure: update or create a focused Skill.
7. Deterministic lifecycle or security automation: consider a Hook only when
   the active coding environment supports it reliably.

Temporary outages, one mistyped command, an isolated simulator failure, and
single accidental typos normally do not qualify for persistence.

## 3. Apply the durability gate

Persist a lesson only when it is:

- specific to this repository;
- reasonably likely to recur;
- useful to correctness, speed, discoverability, or context efficiency;
- consistent with existing architecture; and
- cheaper to preserve than to rediscover.

The default result may be **“No durable repository improvement required.”**
Zero permanent changes is a healthy outcome.

## 4. Choose the smallest effective mechanism

Prefer:

```text
test/lint/script
    → canonical engineering documentation
    → nearest nested AGENTS.md
    → root AGENTS.md
    → focused Skill
```

Before changing guidance, search for an existing rule, merge or prune instead
of duplicating, use the narrowest useful scope, and link to canonical documents
rather than copying them. Do not edit vendor-installed Skills as if they were
UniMate-owned. Make at most a small number of durable changes from one session.

## 5. Verify and report

Run the narrowest check that proves each persisted improvement. Do not repeat
expensive runtime workflows just because prose changed.

In the handoff, briefly state:

- the friction identified and whether it was durable;
- what was persisted, if anything;
- why that location or mechanism was selected.

Do not write a long retrospective report into the repository. Keep semantic
review in this Skill; do not add self-modifying hooks. Reconsider hooks later
only for deterministic lifecycle or security events with reliable tooling
support.

For the repository's coding loop and instruction hierarchy, see the
[Agent workflow](../../../docs/engineering/AGENT_WORKFLOW.md).
