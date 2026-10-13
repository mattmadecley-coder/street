-- Admin accounts, sessions and the audit log, plus a trash for deleted products
-- and brands. Replaces the single shared ADMIN_PASSWORD with per-person logins.
--
-- Everything here is additive and safe to apply more than once. Until the first
-- account is created the admin keeps using the shared password exactly as before.
-- All three admin tables are service-role only (no policies, grants revoked from
-- anon/authenticated); the storefront never reads them.

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null default '',
  role text not null check (role in ('owner', 'admin', 'editor', 'marketing', 'analyst')),
  password_hash text not null,
  must_change_password boolean not null default false,
  totp_secret text,
  totp_enabled boolean not null default false,
  -- RFC 6238 time step of the last accepted code, so a code cannot be replayed.
  totp_last_step bigint,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_users_email_lowercase check (email = lower(btrim(email))),
  constraint admin_users_email_shape check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint admin_users_totp_consistency check (totp_enabled = false or totp_secret is not null)
);

create unique index if not exists admin_users_email_key on public.admin_users (email);

create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.admin_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ip text,
  user_agent text,
  revoked_at timestamptz
);

create index if not exists admin_sessions_user_idx on public.admin_sessions (user_id, created_at desc);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid references public.admin_users(id) on delete set null,
  -- The email (or "shared password") at the time, kept even if the account is later deleted.
  actor_label text not null,
  action text not null,
  target_type text,
  target_id text,
  summary text not null default '',
  details jsonb not null default '{}'::jsonb
);

create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id, at desc);
create index if not exists audit_log_target_idx on public.audit_log (target_type, target_id, at desc);
create index if not exists audit_log_action_idx on public.audit_log (action, at desc);

alter table public.admin_users enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.audit_log enable row level security;

-- Supabase hands every new table broad default permissions (including to service_role),
-- so take everything away from every role first, then grant back only what is needed.
revoke all on table public.admin_users from public, anon, authenticated, service_role;
revoke all on table public.admin_sessions from public, anon, authenticated, service_role;
revoke all on table public.audit_log from public, anon, authenticated, service_role;
revoke all on sequence public.audit_log_id_seq from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.admin_users to service_role;
grant select, insert, update, delete on public.admin_sessions to service_role;
grant select, insert on public.audit_log to service_role;
grant usage, select on sequence public.audit_log_id_seq to service_role;
-- The audit log is append-only for the application: no update or delete grant.

-- Trash: "deleting" a product or brand hides it and stamps deleted_at, so it can be restored.
-- The storefront already hides is_hidden products, so trashed items disappear from the site immediately.
alter table public.products add column if not exists deleted_at timestamptz;
alter table public.brands add column if not exists deleted_at timestamptz;
create index if not exists products_deleted_at_idx on public.products (deleted_at) where deleted_at is not null;
create index if not exists brands_deleted_at_idx on public.brands (deleted_at) where deleted_at is not null;

comment on table public.admin_users is 'Admin accounts (service role only). Passwords are scrypt hashes.';
comment on table public.admin_sessions is 'Revocable admin sign-in sessions (service role only).';
comment on table public.audit_log is 'Append-only record of admin actions (service role only).';
