-- 005_push_subscriptions.sql  (PWA / Push phase)
-- Web-push subscriptions, one row per device/browser, bound to the authenticated user.
-- `endpoint` is the natural upsert key (a device re-subscribing replaces its row).
-- Dead endpoints (HTTP 404/410 on send) are pruned by lib/webpush.ts.

create table if not exists push_subscriptions (
  id           bigint generated always as identity primary key,
  user_email   text not null,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  failed_count int  not null default 0
);

create index if not exists idx_push_user on push_subscriptions (user_email);
