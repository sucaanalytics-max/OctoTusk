---
description: Build any isolated OctoTusk feature via the convergence loop (architect → red-team → build → parallel review → converge → boundary). Generalizes /mobile-feature beyond app/m.
argument-hint: <feature / screen description>
---
Build this OctoTusk feature via the codified agent loop: **$ARGUMENTS**

See `docs/AGENT-LOOP.md` for the full rationale. Orchestrate through the agents — do not freelance.
One writer (`frontend-builder`); every reviewer is read-only and returns `APPROVE` / `REQUEST-CHANGES`.

1. **Plan** — dispatch `architect` for a step plan in an **isolated tree** (never extend a frozen file).
   Require: a reuse map (existing `lib/` + `/api/*`), an explicit **Boundary impact** line, and a slice
   sequence (smallest shippable first). Consider `superpowers:using-git-worktrees` for isolation.
2. **Verify the plan** — dispatch `red-teamer` on the plan (boundary leaks, auth/matcher gaps, regressions,
   edge-case math). Resolve every **blocking** issue before any code is written.
3. **Build a slice** — dispatch `frontend-builder` to implement ONE slice; it runs `npx tsc --noEmit` and
   creates shared helpers (e.g. `lib/format.ts`) only if missing. It must never touch a frozen file.
4. **Parallel review** — dispatch `code-reviewer`, `security-reviewer`, and `red-teamer` on the diff
   **in one message** (concurrent). Collect each verdict.
5. **Converge** — for each `REQUEST-CHANGES` finding, adversarially verify it first (refute-by-default);
   apply only the real ones via `frontend-builder`, then re-review the new diff. Repeat from step 3 for the
   next slice. **Stop when all reviewers APPROVE or after 3 rounds** — then surface remaining findings to the
   human. Never loop unbounded.
6. **Gate** — run `/boundary-check`; confirm `npx tsc --noEmit` is clean.
7. **Summarize** — files changed, slice-by-slice status, `tsc` result, every review verdict, and any
   findings escalated to the human.
