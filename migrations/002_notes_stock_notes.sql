-- 002_notes_stock_notes.sql
-- Shared stock notes. Linked to a stock by a STABLE key (UPPER(trim(tikr))) plus a
-- denormalized stock_name snapshot, so notes survive tikr re-casing / dedup / delisting.
-- Visibility + ownership are enforced in the API route layer (service-role key bypasses RLS).

create table if not exists stock_notes (
  id            bigint generated always as identity primary key,
  stock_key     text not null,                 -- UPPER(trim(tikr)) — durable join key
  original_tikr text not null,                 -- exact tikr submitted (audit / re-derive)
  stock_name    text,                          -- companyShort snapshot at write time
  author_email  text not null,
  category      text not null check (category in ('meeting','discussion','update','thesis','risk','question')),
  body          text not null,
  tags          text[] not null default '{}',  -- normalized: trim + lowercase + dedupe
  visibility    text not null default 'shared' check (visibility in ('shared','private')),
  pinned        boolean not null default false,
  mentions      text[] not null default '{}',  -- resolved @tuskinvest.com emails (shared notes only)
  edited        boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz                    -- soft delete; null = live
);

create index if not exists idx_notes_stock    on stock_notes (stock_key)        where deleted_at is null;
create index if not exists idx_notes_author   on stock_notes (author_email)     where deleted_at is null;
create index if not exists idx_notes_created  on stock_notes (created_at desc)  where deleted_at is null;
create index if not exists idx_notes_mentions on stock_notes using gin (mentions);
create index if not exists idx_notes_tags     on stock_notes using gin (tags);
