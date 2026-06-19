#!/usr/bin/env bash
# PreToolUse(Edit|Write) boundary guard for OctoTusk.
#
# Blocks edits to Do-Not-Touch (frozen) files (see CLAUDE.md → Do-Not-Touch Boundary)
# unless OCTOTUSK_ALLOW_PIPELINE_EDIT=1 is set. Reads the tool-call JSON from stdin and
# checks tool_input.file_path against the frozen globs.
#
# Exit 2 = block (Claude reads stderr and adapts). Exit 0 = allow.
# This is a GUARDRAIL, not a vault: a determined agent can still write via Bash redirects,
# so git review before commit is the real backstop. It fails OPEN (allows) if it cannot
# parse the path, so a parser hiccup never wedges the whole session.

if [ "${OCTOTUSK_ALLOW_PIPELINE_EDIT:-0}" = "1" ]; then
  exit 0
fi

input="$(cat)"

# Robust JSON parse via node (always present in this repo); empty string on any failure.
path="$(printf '%s' "$input" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);const ti=j.tool_input||{};process.stdout.write(ti.file_path||ti.path||"")}catch{process.stdout.write("")}})' 2>/dev/null || true)"

[ -z "$path" ] && exit 0

# Normalize to repo-relative.
proj="${CLAUDE_PROJECT_DIR:-$PWD}"
rel="${path#"$proj"/}"

block() {
  echo "BLOCKED: '$rel' is a Do-Not-Touch (frozen) file — see CLAUDE.md → Do-Not-Touch Boundary." >&2
  echo "If this edit is intentional, set OCTOTUSK_ALLOW_PIPELINE_EDIT=1 and state which file and why first." >&2
  exit 2
}

case "$rel" in
  scripts/sync-to-supabase.ts)            block ;;
  app/api/sync/*|app/api/cron/*|app/api/alerts/*) block ;;
  lib/graph-fetch.ts)                     block ;;
  data/database.json)                     block ;;
  .github/workflows/sync-onedrive.yml)    block ;;
  app/dashboard/*|app/octopus/*)          block ;;
  app/globals.css)                        block ;;
esac

exit 0
