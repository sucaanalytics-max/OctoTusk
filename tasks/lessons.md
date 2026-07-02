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

## 2026-07-02 — Validate data against Supabase (live), not `data/database.json`
- **Trigger:** a data-accuracy audit read `data/database.json` and flagged ABREL as inverted + 75/116 stale upsides. Wrong: the committed `database.json` is a **stale fallback** (was dated 2026-02-22, 205 fields diverged); the live site reads the daily-synced Supabase `sync_snapshot` (id=1, cols: stocks/holdings/ticker_map/synced_at/fo_positions). Against live Supabase + the real vF sheets, bear/base/bull matched to the paisa.
- **Rule:** to verify "what users see," read Supabase `sync_snapshot` (id=1) via `SUPABASE_URL`+`SUPABASE_SERVICE_ROLE_KEY`, then cross-check the vF source in OneDrive ("Tusk - Summary" sheet, B2=TIKR, **B9/C9/D9 = bear/base/bull**, B10/C10/D10 = upsides). Never treat `database.json` as current.
- **Scope:** data audits, `scripts/sync-to-supabase.ts` outputs, `app/api/octopus-feed/route.ts`.

## 2026-07-02 — Upside is recomputed from live CMP; never render stored `upside_*`
- **Trigger:** `/octopus` (via `app/api/octopus-feed/route.ts`) served the snapshot's stored `upside_bear/base/bull`, which is frozen at each vF's authoring price (and can be a `-1` sentinel) — so the wall display showed VEDL +165% / NSE -100% next to a live CMP. Dashboard + mobile were correct because they recompute.
- **Rule:** every surface derives upside as `(target - liveCMP)/liveCMP` via the canonical `lib/scenarioUpside.ts` `scenarioUpside()`. Stored `upside_*` fields are point-in-time only — do not display them. `app/octopus/**` is frozen, but `app/api/octopus-feed/**` is editable — fix live-value bugs in the feed so the frozen client renders correct data.
- **Scope:** `app/api/octopus-feed/route.ts`, any consumer of `upside_bear/base/bull`.
