# AGENT-LOOP — Multi-Model Loop Engineering for OctoTusk

How we build non-trivial features with a **multi-model Claude agent system** that *converges* on
correct, in-bounds code instead of one-shotting it. This is the documented, reusable structure behind
the `/feature-loop` and `/mobile-feature` commands.

> TL;DR — **One writer, many read-only verifiers, model-tiered by cognitive load, iterating
> build → parallel-review → apply until every gate says `APPROVE` or we hit a round cap and escalate
> to the human. Tool-level hooks block out-of-bounds edits *before* they happen.**

---

## 1. The roles (and why each model tier)

Match the model to the cognitive load of the job — don't pay opus rates for `grep`, don't ask haiku to
referee architecture.

| Role | Agent | Model | Why this tier |
|---|---|---|---|
| **Map / locate** | `explorer` | haiku | Mechanical "where is X / what imports Y". Cheap, fast, fans out wide. |
| **Plan** | `architect` | opus | Reads broadly, holds the whole design in context, weighs trade-offs. Read-only. |
| **Build** | `frontend-builder` | sonnet | The *single writer*. Strong code, fast, cost-effective for volume edits. |
| **Audit pipeline** | `data-guardian` | sonnet | Boundary + sync-invariant checks. Read-only. |
| **Adversarial review** | `red-teamer` | opus | Attacks assumptions, verifies claims against source. Read-only. |
| **Correctness gate** | `code-reviewer` | opus | Correctness + guideline conformance. Read-only. |
| **Leak gate** | `security-reviewer` | opus | Data-leak / PII / CSP checklist. Read-only. |
| **Tune the loop** | `loop-engineer` | opus | Meta-reasoning over the *process*: roster fit, tiering, parallelism, convergence, proportionality. Read-only. Optional pre-flight / post-mortem. |

**Principle — one writer, many verifiers.** Exactly one agent (`frontend-builder`) edits files. Every
other agent is **read-only** and returns a *verdict* + ranked findings. This keeps causality legible:
when something breaks, there is one place it could have come from.

---

## 2. The loop

```
        ┌────────────────────────────────────────────────────────┐
        │                                                        │
   architect ──▶ red-teamer ──▶ frontend-builder ──┐              │
   (plan)        (verify plan)   (implement slice)  │             │
                                                    ▼             │
                              ┌───── parallel review ───────┐     │
                              │ code-reviewer               │     │
                              │ security-reviewer           │     │
                              │ red-teamer (diff)           │     │
                              └──────────────┬──────────────┘     │
                                             ▼                    │
                              all APPROVE?  ──no──▶ apply verified │
                                   │                findings ─────┘
                                  yes
                                   ▼
                           /boundary-check ──▶ tsc ──▶ done
```

1. **Plan** — `architect` produces a step plan with an explicit **Boundary impact** line, a reuse map
   (existing `lib/` + `/api/*`), and a slice sequence (smallest shippable first).
2. **Verify the plan** — `red-teamer` attacks the plan *before* any code: boundary leaks, auth/matcher
   gaps, regression risks, edge-case math. Resolve every **blocking** issue first.
3. **Build a slice** — `frontend-builder` implements one slice, runs `npx tsc --noEmit`, stays in bounds.
4. **Parallel review** — dispatch the reviewers the diff needs, **concurrently** (one message): `code-reviewer`
   + `red-teamer` always; `security-reviewer` only when the diff hits its trigger globs (`app/m/**`,
   `lib/mobile/**`, holdings/snapshot, `sw.js`, `next.config.js`); `data-guardian` only when pipeline-adjacent.
   Each returns `APPROVE` / `REQUEST-CHANGES`.
5. **Converge** — if any verifier requests changes, **adversarially verify each finding first**
   (default to refuting — is it real? does it reproduce against source?), apply only the real ones, then
   re-review the new diff. Repeat.
6. **Exit conditions** — stop when *all* verifiers `APPROVE` **or** after **max 3 rounds**, then surface
   remaining findings to the human rather than churning. **Escalate immediately** (don't spend the round
   budget) on contradictory reviewer mandates, or any finding whose fix needs a frozen-file edit. Never loop unbounded.
7. **Gate** — `/boundary-check` (no frozen file touched) + `npx tsc --noEmit` clean before "done".

---

## 3. Why it's built this way (the best practices)

- **Tier by cognitive load.** Reasoning/judgement → opus; volume code generation → sonnet; mechanical
  search → haiku. This is the single biggest cost/quality lever.
- **Separate writing from judging.** A model reviewing its own just-written diff anchors on its choices.
  Independent read-only reviewers (ideally a *different* tier than the writer) catch what the writer can't see.
- **Diversify the lens, don't just add reviewers.** Three reviewers asking the same question is redundant;
  `code-reviewer` (does it work + conform?), `security-reviewer` (does it leak?), and `red-teamer` (what did
  everyone miss?) attack *different* failure modes. Diversity > redundancy.
- **Adversarially verify findings before acting.** Reviewer findings are themselves claims. Refute-by-default
  before applying — otherwise the loop churns on plausible-but-wrong feedback and never converges.
- **Bound the loop and escalate.** A fixed round cap with human escalation beats "loop until perfect."
  Most value lands in rounds 1–2; the tail is for a human to judge.
- **Scale the loop to the blast radius (proportionality).** A one-file CSS restyle does not warrant a
  3-opus-reviewer × 3-round loop; a PIN/holdings change does. Right-size reviewer count and round cap to risk.
  `loop-engineer` is the read-only consultant that composes this per task — an optional `/feature-loop`
  pre-flight, or a post-mortem after a run that churned or over-spent.
- **Guardrails at the tool layer, not post-hoc.** `.claude/hooks/boundary-guard.sh` (PreToolUse) blocks edits
  to frozen files *before* they're written; `git diff` is only the backstop. Prevention > detection.
- **Context hygiene.** Each agent gets a tightly scoped prompt and only the files it needs; only the
  *summary/verdict* returns to the orchestrator. The main thread never fills with file dumps — it holds the
  conclusions, not the evidence.
- **Deterministic orchestration.** Encode the control flow (slice loop, parallel fan-out, exit conditions) in
  a command/script — not free-form "and then I'll maybe review." Determinism makes the loop reproducible.

---

## 4. How to run it

- **Slash command (default):** `/feature-loop <feature description>` — orchestrates the chain above with the
  Agent tool. Generalizes `/mobile-feature` to any isolated feature (not just `app/m/**`).
- **Deterministic variant (optional, for large fan-outs):** a `Workflow` script that encodes the loop with
  `pipeline()` (slices) + `parallel()` (the three reviewers) and a loop-until-`APPROVE`/max-round guard. Use
  this only when the user explicitly opts into workflow orchestration and the scale justifies it.

## 5. Boundaries are sacred

The loop assumes the **Do-Not-Touch boundary** (see `CLAUDE.md`). The single writer never edits a frozen
file; new features live in isolated trees (`app/research/compare/**`, `app/m/**`, `lib/<feature>/**`) and
only *read* frozen outputs through GET seams + pure `lib/` helpers. `/boundary-check` is a hard gate, not a
suggestion.
