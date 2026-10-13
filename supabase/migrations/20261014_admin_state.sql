-- Small key/value store for admin-only state: editable alert thresholds,
-- alert acknowledgements and snoozes, chart annotations, and the last alert
-- digest that was sent. Everything here is internal operating data, so unlike
-- site_settings (which the storefront reads publicly) it is NOT readable by
-- the anon or authenticated roles. Only the server-side service-role key
-- (the admin app) can read or write it.
--
-- Safe to apply more than once. The admin code treats a missing table as
-- "feature not enabled yet" and keeps working, so this can be applied to a
-- staging copy first and production afterwards.

create table if not exists public.admin_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.admin_state enable row level security;

-- No policies on purpose: with RLS on and no policy, only the service role
-- (which bypasses RLS) can touch the table. Revoke the default grants too.
revoke all on table public.admin_state from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.admin_state to service_role;

comment on table public.admin_state is
  'Admin-only key/value state (alert thresholds, alert acknowledgements, chart annotations, last alert digest). Service role only.';
