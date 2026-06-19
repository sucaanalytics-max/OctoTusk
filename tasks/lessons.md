# Lessons

Durable, committed memory for working in this repo. **Read at session start. Append after any user correction or hard-won discovery.** Keep entries short; one lesson each.

Entry template:
```
## YYYY-MM-DD — <short title>
- **Trigger:** what happened / what went wrong.
- **Rule:** what to do instead.
- **Scope:** files / agents it applies to.
```

---

## 2026-06-19 — Memory file is `CLAUDE.md` (uppercase)
- **Trigger:** the file was tracked as lowercase `claude.md`; broke memory load on case-sensitive CI/Linux and the `../CLAUDE.md` link in `docs/DASHBOARD-GUIDELINE.md`.
- **Rule:** the canonical name is `CLAUDE.md`. Never recreate `claude.md`. On a case-insensitive FS, rename via a two-step (`git mv claude.md claude.md.tmp && git mv claude.md.tmp CLAUDE.md`).
- **Scope:** repo root.

## 2026-06-19 — The four pipeline files are a pre-dirty baseline, not violations
- **Trigger:** `app/api/sync/route.ts`, `scripts/sync-to-supabase.ts`, `.github/workflows/sync-onedrive.yml` were already modified and `lib/graph-fetch.ts` untracked at the start of mobile/security work.
- **Rule:** a boundary check that diffs vs HEAD would false-positive on these. The boundary guard blocks on **path membership**, not diff-vs-HEAD.
- **Scope:** `.claude/hooks/boundary-guard.sh`, `data-guardian`.

## 2026-06-19 — Numbers go through `lib/format.ts`
- **Trigger:** `fmtPct` etc. were duplicated across many files; `docs/DASHBOARD-GUIDELINE.md §8` mandates a single formatter.
- **Rule:** create/extend `lib/format.ts` before formatting any number. en-IN locale, `−` minus char, ₹ prefix, one decimal.
- **Scope:** all UI, especially `app/m/**`.

## 2026-06-19 — Mobile uses the Dashboard aesthetic, not Octopus
- **Trigger:** two visual systems exist (Octopus wall-display vs Dashboard workbench).
- **Rule:** the mobile app (`app/m/**`) is the Dashboard token system (`:root` / `[data-theme]`), cards + chips, light+dark. Octopus styling is wall-display only.
- **Scope:** `app/m/**`, `app/m.css`.

## 2026-06-19 — Import `lib/sebi.ts`; never recreate it
- **Trigger:** a design draft proposed a new SEBI segmentation helper; `lib/sebi.ts` (`getSebiSegment`, `SEBI_LABELS`) already exists and is shared.
- **Rule:** reuse existing pure `lib/` helpers. Only `lib/scenarioUpside.ts` + `lib/holdingsPnl.ts` are genuinely new (re-expressed from inline `DashboardClient.tsx` logic, with source line cross-refs).
- **Scope:** `lib/mobile/**`.

## 2026-06-19 — Portfolio data is sensitive; never persist it client-side
- **Trigger:** `GET /api/snapshot` was leaking holdings unauthenticated (V1); `data/database.json` had real holdings in git (V2).
- **Rule:** holdings/P&L/PIN/note bodies never go to localStorage/sessionStorage/IndexedDB/CacheStorage; never in URLs or push payloads; holdings only via PIN-gated `/api/holdings`. The committed `database.json` carries `stocks`+`ticker_map` only.
- **Scope:** `app/m/**`, `lib/mobile/**`, `app/api/holdings/route.ts`, `app/api/snapshot/route.ts`.
