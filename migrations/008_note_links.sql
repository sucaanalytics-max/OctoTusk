-- 008_note_links.sql  (Stock-notes link attachments)
-- Adds a links array to stock_notes. Each element: { "url": "https://…", "label"?: "…" }.
-- Links are https-only, validated + capped at the API layer (lib/noteTypes.ts normalizeLinks).
-- No file storage — links only (file uploads deferred). Idempotent.
-- Apply in the Supabase SQL editor for the LIVE project (ref avqwpebveqetwwzkmtux).

alter table stock_notes add column if not exists links jsonb not null default '[]'::jsonb;
