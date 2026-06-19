---
description: Plan + build a new mobile screen via the OctoTusk agent chain (architect → red-team → build → review → boundary).
argument-hint: <screen / feature description>
---
Build this OctoTusk mobile feature: **$ARGUMENTS**

Orchestrate through the agents — do not freelance:
1. Dispatch the `architect` agent to produce a plan under `app/m/**` (Dashboard aesthetic, reuse `lib/` + `/api/*`, an explicit "Boundary impact" line). Consider a git worktree (`superpowers:using-git-worktrees`) for isolation.
2. Dispatch `red-teamer` on that plan; resolve every blocking issue before any code.
3. On approval, dispatch `frontend-builder` to implement (create `lib/format.ts` if missing; never touch a frozen file).
4. Dispatch `code-reviewer` and `security-reviewer` on the diff.
5. Run `/boundary-check`.
6. Summarize: files changed, `tsc` result, review verdicts.
