-- 011_notifications.sql — per-user notification inbox.
-- OWNER-SCOPED reads/mutates in the API layer (service-role bypasses RLS, so the route is the
-- only barrier). Rows are written SERVER-SIDE ONLY (the alerts engine + the chat route); the
-- client never POSTs here. Bodies carry NO holdings/PII — only who / which-stock + a deep link.
-- No uniqueness constraint: recurring alert_fire rows intentionally repeat (each fire is a real
-- event); chat-mention dedupe is by message id in application code.
create table if not exists notifications (
  id          bigint generated always as identity primary key,
  user_email  text not null,                       -- recipient; server-set, never client-trusted
  kind        text not null check (kind in ('alert_fire','chat_mention','chat_reply')),
  title       text not null,
  body        text not null,
  url         text not null,                        -- deep link: /m/stock/<tikr> or /m/chat/...
  stock_key   text,
  ref_id      bigint,                               -- alert id / message id (traceback)
  read_at     timestamptz,                          -- null = unread
  created_at  timestamptz not null default now()
);
create index if not exists idx_notif_owner_created on notifications (user_email, created_at desc);
create index if not exists idx_notif_owner_unread  on notifications (user_email) where read_at is null;
