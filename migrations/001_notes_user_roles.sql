-- 001_notes_user_roles.sql
-- Email -> role map for the notes feature.
-- Seeded manually in the Supabase console. There is NO API write path to this table.
-- An email absent from this table resolves to 'analyst' (fail-closed, least privilege).

create table if not exists user_roles (
  email      text primary key,
  role       text not null default 'analyst' check (role in ('analyst','vp','cio')),
  updated_at timestamptz not null default now()
);

-- Seed your team (edit emails), then re-run:
-- insert into user_roles (email, role) values
--   ('jay.bansal@tuskinvest.com', 'cio')
-- on conflict (email) do update set role = excluded.role, updated_at = now();
