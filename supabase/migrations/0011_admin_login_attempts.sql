-- Basic brute-force protection for /admin/login (single shared
-- ADMIN_PASSWORD, no per-user accounts, so this tracks by client IP
-- instead). Not a full auth system — just enough that unlimited automated
-- password guesses aren't free.
create table if not exists public.admin_login_attempts (
  ip text primary key,
  fail_count integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.admin_login_attempts enable row level security;
-- No public policies: only the service-role key (used server-side by the
-- login action) can read/write this table.
