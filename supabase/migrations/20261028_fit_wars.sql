-- Street Fit Wars: school-specific head-to-head outfit voting.
-- Applied to Street's self-hosted Postgres on the Netcup VPS through the
-- existing Supabase-compatible PostgREST/Storage stack; no Supabase Cloud
-- project is required.
-- All tables are service-role only. Public visitors go through the Next.js
-- server routes, which validate campaign state, rate-limit writes, and keep
-- voter identity out of the public response.

create table if not exists public.fit_wars_campaigns (
  id uuid primary key default gen_random_uuid(),
  school_name text not null,
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{1,31}$'),
  label text not null default '',
  headline text not null default 'WHOSE FIT IS BETTER?',
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  audience_type text not null default 'high_school' check (audience_type in ('high_school', 'adult_opt_in')),
  results_headline text not null default 'YOU''VE GOT TASTE. OR DO YOU?',
  results_copy text not null default 'Want to see which fits everyone loved?',
  results_note text not null default 'Get the current Fit Wars leaderboard sent to your inbox.',
  marketing_label text not null default 'Send me fashion finds and updates from Street.',
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  archived_at timestamptz
);

create table if not exists public.fit_wars_outfits (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.fit_wars_campaigns(id) on delete cascade,
  display_name text not null,
  image_url text not null,
  source_type text not null default 'upload' check (source_type in ('upload', 'url', 'instagram')),
  source_url text,
  instagram_url text,
  permission_status text not null default 'pending' check (permission_status in ('pending', 'approved', 'rejected', 'removed')),
  permission_note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fit_wars_matchups (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.fit_wars_campaigns(id) on delete cascade,
  position integer not null check (position > 0),
  left_outfit_id uuid not null references public.fit_wars_outfits(id) on delete restrict,
  right_outfit_id uuid not null references public.fit_wars_outfits(id) on delete restrict,
  duration_ms integer not null default 3500 check (duration_ms between 1800 and 10000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, position),
  check (left_outfit_id <> right_outfit_id)
);

create table if not exists public.fit_wars_commentaries (
  id uuid primary key default gen_random_uuid(),
  matchup_id uuid not null references public.fit_wars_matchups(id) on delete cascade,
  body text not null,
  link_label text,
  link_url text,
  is_active boolean not null default true,
  position integer not null default 1 check (position > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fit_wars_sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.fit_wars_campaigns(id) on delete cascade,
  session_key text not null,
  visitor_hash text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (campaign_id, session_key)
);

create table if not exists public.fit_wars_votes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.fit_wars_campaigns(id) on delete cascade,
  matchup_id uuid not null references public.fit_wars_matchups(id) on delete cascade,
  session_id uuid references public.fit_wars_sessions(id) on delete set null,
  session_key text not null,
  choice_outfit_id uuid not null references public.fit_wars_outfits(id) on delete restrict,
  event_id uuid not null unique,
  created_at timestamptz not null default now(),
  unique (campaign_id, matchup_id, session_key)
);

create table if not exists public.fit_wars_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.fit_wars_campaigns(id) on delete cascade,
  session_id uuid references public.fit_wars_sessions(id) on delete set null,
  session_key text,
  event_type text not null check (event_type in ('landing', 'matchup_view', 'vote', 'commentary_view', 'email_form_view', 'email_request', 'marketing_opt_in', 'street_click', 'share', 'session_complete', 'error')),
  matchup_id uuid references public.fit_wars_matchups(id) on delete set null,
  event_id uuid not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.fit_wars_email_requests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.fit_wars_campaigns(id) on delete cascade,
  session_id uuid references public.fit_wars_sessions(id) on delete set null,
  email text not null,
  marketing_opt_in boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  resend_id text,
  leaderboard_snapshot jsonb not null default '[]'::jsonb,
  error text,
  consent_ip text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists fit_wars_outfits_campaign_idx on public.fit_wars_outfits (campaign_id, is_active, permission_status);
create index if not exists fit_wars_matchups_campaign_idx on public.fit_wars_matchups (campaign_id, is_active, position);
create index if not exists fit_wars_commentaries_matchup_idx on public.fit_wars_commentaries (matchup_id, is_active, position);
create index if not exists fit_wars_sessions_campaign_idx on public.fit_wars_sessions (campaign_id, first_seen_at desc);
create index if not exists fit_wars_votes_campaign_idx on public.fit_wars_votes (campaign_id, created_at desc);
create index if not exists fit_wars_votes_matchup_idx on public.fit_wars_votes (matchup_id, choice_outfit_id);
create index if not exists fit_wars_events_campaign_idx on public.fit_wars_events (campaign_id, event_type, created_at desc);
create index if not exists fit_wars_email_campaign_idx on public.fit_wars_email_requests (campaign_id, created_at desc);

alter table public.fit_wars_campaigns enable row level security;
alter table public.fit_wars_outfits enable row level security;
alter table public.fit_wars_matchups enable row level security;
alter table public.fit_wars_commentaries enable row level security;
alter table public.fit_wars_sessions enable row level security;
alter table public.fit_wars_votes enable row level security;
alter table public.fit_wars_events enable row level security;
alter table public.fit_wars_email_requests enable row level security;

revoke all on table public.fit_wars_campaigns, public.fit_wars_outfits, public.fit_wars_matchups,
  public.fit_wars_commentaries, public.fit_wars_sessions, public.fit_wars_votes,
  public.fit_wars_events, public.fit_wars_email_requests from anon, authenticated;
grant all on table public.fit_wars_campaigns, public.fit_wars_outfits, public.fit_wars_matchups,
  public.fit_wars_commentaries, public.fit_wars_sessions, public.fit_wars_votes,
  public.fit_wars_events, public.fit_wars_email_requests to service_role;

-- A fictional, stock-photo-backed campaign makes the full flow testable after
-- the migration is applied. It is intentionally labelled as a demo.
do $$
declare
  v_campaign_id uuid;
  outfit_a uuid;
  outfit_b uuid;
  outfit_c uuid;
  outfit_d uuid;
  matchup_id uuid;
begin
  select c.id into v_campaign_id from public.fit_wars_campaigns c where c.code = 'mc' limit 1;
  if v_campaign_id is null then
    insert into public.fit_wars_campaigns (school_name, code, label, headline, status, audience_type)
    values ('Mill Creek', 'mc', 'MILL CREEK FIT WARS · DEMO', 'WHOSE FIT IS BETTER?', 'active', 'high_school')
    returning id into v_campaign_id;
  end if;

  select o.id into outfit_a from public.fit_wars_outfits o where o.campaign_id = v_campaign_id and o.display_name = 'Demo A' limit 1;
  if outfit_a is null then
    insert into public.fit_wars_outfits (campaign_id, display_name, image_url, source_type, source_url, permission_status, permission_note)
    values (v_campaign_id, 'Demo A', 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=85', 'url', 'https://images.unsplash.com/', 'approved', 'Fictional demo participant using a stock image.')
    returning id into outfit_a;
  end if;
  select o.id into outfit_b from public.fit_wars_outfits o where o.campaign_id = v_campaign_id and o.display_name = 'Demo B' limit 1;
  if outfit_b is null then
    insert into public.fit_wars_outfits (campaign_id, display_name, image_url, source_type, source_url, permission_status, permission_note)
    values (v_campaign_id, 'Demo B', 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=900&q=85', 'url', 'https://images.unsplash.com/', 'approved', 'Fictional demo participant using a stock image.')
    returning id into outfit_b;
  end if;
  select o.id into outfit_c from public.fit_wars_outfits o where o.campaign_id = v_campaign_id and o.display_name = 'Demo C' limit 1;
  if outfit_c is null then
    insert into public.fit_wars_outfits (campaign_id, display_name, image_url, source_type, source_url, permission_status, permission_note)
    values (v_campaign_id, 'Demo C', 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=85', 'url', 'https://images.unsplash.com/', 'approved', 'Fictional demo participant using a stock image.')
    returning id into outfit_c;
  end if;
  select o.id into outfit_d from public.fit_wars_outfits o where o.campaign_id = v_campaign_id and o.display_name = 'Demo D' limit 1;
  if outfit_d is null then
    insert into public.fit_wars_outfits (campaign_id, display_name, image_url, source_type, source_url, permission_status, permission_note)
    values (v_campaign_id, 'Demo D', 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=85', 'url', 'https://images.unsplash.com/', 'approved', 'Fictional demo participant using a stock image.')
    returning id into outfit_d;
  end if;

  if not exists (select 1 from public.fit_wars_matchups m where m.campaign_id = v_campaign_id) then
    insert into public.fit_wars_matchups (campaign_id, position, left_outfit_id, right_outfit_id) values (v_campaign_id, 1, outfit_a, outfit_b) returning id into matchup_id;
    insert into public.fit_wars_commentaries (matchup_id, body, position) values (matchup_id, 'The hoodie had potential. The shoes? Different story.');
    insert into public.fit_wars_matchups (campaign_id, position, left_outfit_id, right_outfit_id) values (v_campaign_id, 2, outfit_c, outfit_d) returning id into matchup_id;
    insert into public.fit_wars_commentaries (matchup_id, body, position) values (matchup_id, 'Not bad. But we have seen harder pieces on Street.');
    insert into public.fit_wars_matchups (campaign_id, position, left_outfit_id, right_outfit_id) values (v_campaign_id, 3, outfit_b, outfit_c) returning id into matchup_id;
    insert into public.fit_wars_commentaries (matchup_id, body, position) values (matchup_id, 'Think you can dress better? Prove it.');
  end if;
end $$;

notify pgrst, 'reload schema';
