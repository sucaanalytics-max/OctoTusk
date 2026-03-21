# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Dev server on localhost:3000
npm run build      # Production build
npx tsc --noEmit   # Type check (no tsc script in package.json)
npx tsx scripts/sync-to-supabase.ts  # Run manual OneDrive → Supabase sync locally
```

No test suite. No lint script — `npx tsc --noEmit` is the main pre-commit check.

## Architecture

**OctoTusk** is a Next.js App Router equity research portfolio dashboard. It pulls stock valuations from OneDrive Excel files, merges them with a baseline, persists to Supabase, and shows live prices from Yahoo Finance.

### Data pipeline

```
OneDrive (Microsoft Graph)
  ├── JVB Output.xlsx            → baseline stock list (~95 stocks)
  └── Portfolio Stock Valuations/
      └── *_vf.xlsx files        → per-stock bear/base/bull valuations
          │
          ├── scripts/sync-to-supabase.ts  (GitHub Action, runs 8:10 AM IST Mon–Sat)
          └── /api/sync route              (frontend "Sync Data" button)
                    │
                    └── Supabase sync_snapshot table  ← fallback: data/database.json
```

### Page flow

`app/dashboard/page.tsx` (server component) loads the latest snapshot from Supabase at SSR time, falling back to `data/database.json` if Supabase is unconfigured. Passes data to `DashboardClient.tsx`.

`DashboardClient.tsx` is a large single-file client component (~3000 lines) with 4 tabs: **octopus** (treemap + stock table), **holdings** (PIN-protected P&L + risk dashboard), **comparison** (VP/SA analytics), **decisions** (journal).

Live CMP is fetched from `/api/quotes` on mount and every 60 seconds during market hours (IST 9:15–15:30 Mon–Fri). Quotes are keyed by TIKR and merged with stock data client-side.

### vF merge logic (critical path)

Both `scripts/sync-to-supabase.ts` and `app/api/sync/route.ts` share the same merge algorithm:

1. Parse JVB Output → baseline stocks
2. Parse each `*_vf.xlsx` → TIKR from cell `B2`, valuations from named cells
3. Apply `TIKR_ALIAS` map (e.g. `"SMARTWORKS" → "Smartworks"`) — **delete the original key after aliasing** to prevent duplicate standalone entries
4. Fuzzy-match remaining vF TIKRs to baseline (case-insensitive substring, ≥50% length) — **delete original key + break after match**
5. Merge matched vF fields onto baseline stock (`bear_current`, `base_current`, `bull_current`, `upside_*`, `target_*`, `vp`, `sa`, etc.)
6. Unmatched vF stocks added as standalone entries
7. **Deduplicate `mergedStocks` by tikr** (keep first) before upserting to Supabase

Steps 3–4 (key deletion) and step 7 (deduplication) prevent duplicate stocks appearing in the dashboard when vF file TIKRs differ in case from baseline.

### ticker_map

`data/database.json` contains a `ticker_map` mapping internal TIKRs to Yahoo Finance symbols:
```json
{ "Smartworks": "SMARTWORKS.NS", "DUROPLY": "DUROPLY.BO" }
```
`/api/quotes` uses this to batch-fetch prices (tries `.NS`, falls back to `.BO`). When adding a new vF-only stock, add its Yahoo symbol here.

### Environment variables

No `.env.example`. Required:

| Variable | Purpose |
|---|---|
| `AZURE_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` | Microsoft Graph auth |
| `GRAPH_DRIVE_ID`, `GRAPH_OCTOPUS_ITEM_ID` | OneDrive drive + JVB file |
| `GRAPH_VF_FOLDER_PATH`, `GRAPH_VF_FOLDER_ID` | vF folder path + fallback ID |
| `GRAPH_POSITIONS_FOLDER_ID` | Holdings exports folder |
| `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET` | NextAuth (restricted to `@tuskinvest.com`) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Persistence (optional) |
| `HOLDINGS_PIN` | PIN to unlock holdings tab |

### CSS conventions

All design tokens are CSS custom properties in `app/globals.css` (`--color-*`, `--text-*`, `--space-*`). For new responsive layout, **prefer fluid techniques** — `.kpi-grid` uses `auto-fill minmax(160px, 1fr)`, `.pnl-scenario-grid` uses `repeat(3, 1fr)`, SVG charts use `viewBox` + CSS `max-width`. Avoid adding `@media` breakpoints for new layout; use `clamp()` and `auto-fill` instead.

---

## Context Management

Context is your most important resource.
Proactively use subagents (Task tool) to keep exploration, research, and verbose
operations out of the main conversation.

**Default to spawning agents for:**
- Codebase exploration (reading 3+ files to answer a question)
- Research tasks (web searches, doc lookups, investigating how something works)
- Code review or analysis (produces verbose output)
- Any investigation where only the summary matters

**Stay in main context for:**
- Direct file edits the user requested
- Short, targeted reads (1-2 files)
- Conversations requiring back-and-forth
- Tasks where user needs intermediate steps

**Rule of thumb:** If a task will read more than ~3 files or produce output
the user doesn't need to see verbatim, delegate it to a subagent and return
a summary.

---

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

---

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

---

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
