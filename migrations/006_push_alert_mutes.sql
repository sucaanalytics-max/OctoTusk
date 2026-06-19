-- 006_push_alert_mutes.sql  (PWA / Push phase)
-- Per-user mute for price-alert PUSH. Deliberately separate from the global `alert_prefs`
-- table (which still governs the shared Telegram channel) so per-user push cannot break
-- the existing alert engine. A user receives a price-alert push for a stock iff:
--   (follows it OR holds it) AND not in push_alert_mutes AND global alert_prefs != false.

create table if not exists push_alert_mutes (
  user_email text not null,
  stock_key  text not null,                     -- UPPER(trim(tikr))
  created_at timestamptz not null default now(),
  primary key (user_email, stock_key)
);
