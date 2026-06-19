-- 004_notes_stock_follows.sql
-- Per-user followed stocks. Drives "new note on a followed stock" push and is one of
-- the recipient sources for per-user price-alert push. Keyed by the same stable
-- stock_key = UPPER(trim(tikr)) used by stock_notes.

create table if not exists stock_follows (
  user_email text not null,
  stock_key  text not null,                     -- UPPER(trim(tikr))
  created_at timestamptz not null default now(),
  primary key (user_email, stock_key)
);

create index if not exists idx_follows_stock on stock_follows (stock_key);
