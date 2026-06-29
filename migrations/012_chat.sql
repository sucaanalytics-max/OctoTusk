-- 012_chat.sql — team chat. One table, two channels via (scope, scope_key):
--   stock:  scope_key = UPPER(trim(tikr))     (per-stock Discussion thread)
--   global: scope_key = 'GLOBAL'              (one firm-wide channel)
-- READ is team-scoped (any authed @tuskinvest.com user, like shared notes). WRITE sets author
-- server-side from auth(). Edit/delete = author or VP/CIO (route-layer; service-role bypasses RLS).
-- Soft-delete via deleted_at (mirrors stock_notes). @mentions notify via the notifications table.
create table if not exists chat_messages (
  id           bigint generated always as identity primary key,
  scope        text not null check (scope in ('stock','global')),
  scope_key    text not null,                       -- 'GLOBAL' or UPPER(trim(tikr))
  author_email text not null,                       -- server-set from auth(); never client-trusted
  body         text not null,
  mentions     text[] not null default '{}',        -- resolved @tuskinvest.com emails (allowlist)
  stock_name   text,                                 -- snapshot for stock-scope titles/deep links
  edited       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz                           -- null = live
);
create index if not exists idx_chat_scope
  on chat_messages (scope, scope_key, created_at desc) where deleted_at is null;
create index if not exists idx_chat_mentions
  on chat_messages using gin (mentions) where deleted_at is null;
