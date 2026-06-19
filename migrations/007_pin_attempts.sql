-- 007_pin_attempts.sql  (Security / holdings PIN hardening — H3)
-- Server-side brute-force lockout for the holdings PIN, keyed by the authenticated
-- user email. Survives serverless cold starts and is shared across instances — unlike
-- the in-memory, per-instance IP rate-limiter in middleware.ts (which is bypassable by
-- rotating IPs / hitting many instances). One row per user.
--
-- The route (app/api/holdings/route.ts via lib/pinLockout.ts) fails OPEN if this table
-- is missing or unreachable: the constant-time PIN compare still gates access, so a
-- not-yet-applied migration can never lock anyone out. Apply via the Supabase SQL editor.

create table if not exists pin_attempts (
  user_email   text primary key,
  fail_count   int  not null default 0,
  locked_until timestamptz,                 -- null = not locked
  last_attempt timestamptz not null default now()
);
