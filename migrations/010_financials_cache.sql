-- 010_financials_cache.sql — Trendlyne financials cache (PUBLIC market data; NOT PII).
--
-- One row per resolved Trendlyne symbol. The verbatim doPost success body is kept in `payload`
-- so line items we haven't modelled survive; the app derives a typed projection at read time.
-- Quota-friendly by design: a row is written ONLY on a fresh, validated fetch (or a negative
-- result). Staleness is computed app-side from `fetched_at` and NEVER triggers an auto-refetch.
--
-- Owner/auth: service-role only (the API route is auth()-gated); RLS not required — mirrors the
-- 009_user_alerts note. Idempotent. Apply in the Supabase SQL editor like 001–009.

create table if not exists financials_cache (
  symbol            text not null,                          -- resolved Trendlyne symbol, UPPER
  exchange          text not null default 'NSE' check (exchange in ('NSE','BSE')),
  tikr              text,                                   -- internal tikr that resolved here (provenance)
  payload           jsonb,                                  -- verbatim doPost success body; null for not_found
  source            text not null default 'webapp'
                      check (source in ('webapp','not_found','manual')),
  fetched_at        timestamptz not null default now(),     -- last successful upstream call (drives staleness + daily budget)
  in_progress_until timestamptz,                            -- soft stampede guard: a fetch is in flight until this instant
  created_at        timestamptz not null default now(),
  primary key (symbol, exchange)
);

create index if not exists idx_financials_cache_tikr on financials_cache (tikr);
-- Supports the daily-budget count: how many fresh fetches happened since UTC midnight.
create index if not exists idx_financials_cache_fetched on financials_cache (fetched_at);
