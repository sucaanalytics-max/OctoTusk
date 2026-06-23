# Database migrations

OctoTusk's Supabase schema is managed manually (no migration framework is wired
into the app). These files are the **source of truth** for the schema — commit
them, and apply each one **in numerical order** in the Supabase **SQL Editor**
(Dashboard → SQL Editor → New query → paste → Run).

All statements are idempotent (`create table if not exists`, `create index if not
exists`), so re-running a file is safe.

| File | Purpose | Phase |
|---|---|---|
| `001_notes_user_roles.sql` | `user_roles` email→role map (seed your team here) | Notes |
| `002_notes_stock_notes.sql` | `stock_notes` — the shared notes table | Notes |
| `003_notes_note_edits.sql` | `note_edits` — edit/delete audit trail | Notes |
| `004_notes_stock_follows.sql` | `stock_follows` — per-user followed stocks | Notes |
| `005_push_subscriptions.sql` | `push_subscriptions` — web-push endpoints | PWA/Push |
| `006_push_alert_mutes.sql` | `push_alert_mutes` — per-user price-alert mute | PWA/Push |
| `007_pin_attempts.sql` | `pin_attempts` — holdings-PIN brute-force lockout (H3) | Security |
| `008_note_links.sql` | `stock_notes.links` — link attachments on notes | Notes |
| `009_user_alerts.sql` | `user_alerts` — per-user custom price/target/upside/day-move alerts | Alerts |

## Important

- **Seed `user_roles` after running `001`.** An email **not** present in `user_roles`
  resolves to the least-privileged role (`analyst`) — this is intentional
  (fail-closed). Seed every team member so `@mentions` can resolve them.
- Authorization is enforced in the Next.js API route layer, **not** by Postgres
  RLS — the app connects with the Supabase **service-role** key, which bypasses
  RLS. Do not rely on RLS for these tables.

## Seeding roles (run after 001, edit emails)

```sql
insert into user_roles (email, role) values
  ('jay.bansal@tuskinvest.com', 'cio')
  -- ('analyst1@tuskinvest.com', 'analyst'),
  -- ('vp1@tuskinvest.com', 'vp')
on conflict (email) do update set role = excluded.role, updated_at = now();
```
