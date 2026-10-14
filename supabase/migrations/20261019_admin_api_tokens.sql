-- Personal access tokens for the Street admin's MCP server, so an AI assistant (Claude, ChatGPT, ...)
-- can work in the admin as the person who created the token, with their role's permissions at most.
-- Only a SHA-256 hash of each token is stored; the token itself is shown once, when it is created.
--
-- Safe to apply more than once. Service role only.

create table if not exists public.admin_api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.admin_users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  -- First characters of the token, so a person can recognise which one is which.
  token_prefix text not null,
  token_hash text not null unique,
  -- Tokens build things (segments, templates, campaign drafts) by default. Sending email to real
  -- customers is a separate, explicit permission that is off unless the owner turns it on.
  can_send boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists admin_api_tokens_user_idx on public.admin_api_tokens (user_id, created_at desc);

alter table public.admin_api_tokens enable row level security;
revoke all on table public.admin_api_tokens from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.admin_api_tokens to service_role;

comment on table public.admin_api_tokens is 'Hashed personal access tokens for the admin MCP server. Service role only.';

notify pgrst, 'reload schema';
