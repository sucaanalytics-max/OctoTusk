-- 003_notes_note_edits.sql
-- Append-only audit trail for note edits / deletes / restores.
-- Each row snapshots the PREVIOUS state before the mutation.

create table if not exists note_edits (
  id              bigint generated always as identity primary key,
  note_id         bigint not null references stock_notes(id) on delete cascade,
  editor_email    text not null,
  action          text not null check (action in ('edit','delete','restore')),
  prev_body       text,
  prev_category   text,
  prev_tags       text[],
  prev_visibility text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_note_edits_note on note_edits (note_id, created_at desc);
