-- Email platform, stage 1: saved audience segments and reusable email templates for Street's own
-- customers (contacts live in email_contacts). Campaigns and sequences come in later migrations.
--
-- Safe to apply more than once. Internal operating data: service role only (like admin_state).
-- The admin treats a missing table as "not enabled yet".

create table if not exists public.email_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  -- { "match": "all" | "any", "conditions": [ { "type": "...", ... } ] } (validated by the app)
  definition jsonb not null default '{"match":"all","conditions":[]}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists email_segments_name_key on public.email_segments (lower(name));

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  subject text not null default '' check (char_length(subject) <= 200),
  preheader text not null default '' check (char_length(preheader) <= 200),
  -- Page-level look: { width, background, contentBackground, font, accent, textColor } (validated by the app)
  design jsonb not null default '{}'::jsonb,
  -- Ordered list of content blocks (validated by the app)
  blocks jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists email_templates_updated_idx on public.email_templates (updated_at desc);

alter table public.email_segments enable row level security;
alter table public.email_templates enable row level security;

-- No policies on purpose. Revoke the default grants, then give the service role only what it needs.
revoke all on table public.email_segments, public.email_templates from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.email_segments, public.email_templates to service_role;

comment on table public.email_segments is 'Saved audience segments (rules over email_contacts). Service role only.';
comment on table public.email_templates is 'Reusable email layouts built in the admin editor. Service role only.';

notify pgrst, 'reload schema';
