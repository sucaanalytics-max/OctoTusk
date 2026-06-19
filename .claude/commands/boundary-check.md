---
description: Verify no Do-Not-Touch (frozen) file was changed in the working tree.
allowed-tools: Bash(git diff:*), Bash(git status:*), Bash(git ls-files:*)
---
Changed + new paths:
!`git diff --name-only HEAD; git diff --name-only --cached; git ls-files --others --exclude-standard`

Compare each path against the frozen glob in `CLAUDE.md` (Do-Not-Touch Boundary):
`scripts/sync-to-supabase.ts`, `app/api/sync/**`, `app/api/cron/**`, `app/api/alerts/**`, `lib/graph-fetch.ts`, `data/database.json`, `.github/workflows/sync-onedrive.yml`, `app/dashboard/**`, `app/octopus/**`, `app/globals.css`.

Known, authorized exceptions (do NOT fail on these):
- The pre-dirty pipeline baseline: `app/api/sync/route.ts`, `scripts/sync-to-supabase.ts`, `.github/workflows/sync-onedrive.yml`, `lib/graph-fetch.ts`.
- `data/database.json` — the authorized V2 security purge (holdings removed).

Output **PASS** (listing any allowed/baseline matches) or **FAIL** with the offending paths. If a match is ambiguous, delegate to the `data-guardian` agent.
