---
description: Read-only sanity check that the data pipeline is intact (no Graph/Supabase calls).
allowed-tools: Bash(npx tsc:*)
---
Dispatch the `data-guardian` agent to verify (strictly read-only, no network):
- vF merge invariants present in `scripts/sync-to-supabase.ts` + `app/api/sync/route.ts` (alias-key deletion, fuzzy-match break, dedupe-by-tikr keep-first).
- `data/database.json` parses and carries `stocks` + `ticker_map` only (no holdings / PII).
- `npx tsc --noEmit` is clean.

Report PASS / FAIL. Do NOT run the real sync or call OneDrive / Supabase.
