-- 009_user_alerts.sql — per-user CUSTOM price alerts (mobile Alerts tab).
-- Each alert is owned by user_email and pushed only to that user's devices.
-- Owner scoping + validation are enforced in the API route layer (service-role bypasses
-- RLS). Edge-trigger + cooldown state lives ON the row (in_condition / last_fired_at) so the
-- engine needs no separate state table. Idempotent. Apply in the Supabase SQL editor.

create table if not exists user_alerts (
  id            bigint generated always as identity primary key,
  user_email    text    not null,                 -- server-set from auth(); NEVER client-trusted
  stock_key     text    not null,                 -- UPPER(trim(tikr))
  original_tikr text    not null,                 -- exact tikr; must resolve in ticker_map to price
  stock_name    text,
  metric        text    not null check (metric in
                  ('price_above','price_below','target_near','upside_above','pct_move_abs')),
  target_type   text    check (target_type in ('bear','base','bull','target1y')),  -- target_near only
  threshold     double precision not null,        -- ₹ (price_*) or % (others)
  active        boolean not null default true,
  one_shot      boolean not null default true,    -- fire once then auto-disable
  cooldown_sec  integer not null default 3600,    -- recurring re-fire floor
  in_condition  boolean not null default false,   -- edge-trigger latch (was-true last tick)
  last_fired_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_user_alerts_owner  on user_alerts (user_email);
create index if not exists idx_user_alerts_active on user_alerts (active) where active = true;

-- Block duplicate ACTIVE rules (same owner/stock/metric/target/threshold).
create unique index if not exists idx_user_alerts_uniq
  on user_alerts (user_email, stock_key, metric, coalesce(target_type, ''), threshold)
  where active;
