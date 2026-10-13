-- Email platform, stage 2: campaigns (one-off sends to a segment) and their per-recipient send log.
-- Safe to apply more than once. Internal operating data: service role only. The admin treats missing
-- tables as "not enabled yet".

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sending', 'sent', 'canceled')),
  template_id uuid references public.email_templates(id) on delete set null,
  segment_id uuid references public.email_segments(id) on delete set null,
  subject text not null default '' check (char_length(subject) <= 200),
  preheader text not null default '' check (char_length(preheader) <= 200),
  -- Frozen copies taken when the campaign is scheduled or sent, so later edits to the template or
  -- the segment never change a campaign that is already on its way.
  content jsonb,
  segment_definition jsonb,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  recipients_total integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_campaigns_status_idx on public.email_campaigns (status, scheduled_at);
create index if not exists email_campaigns_created_idx on public.email_campaigns (created_at desc);

create table if not exists public.email_campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  contact_id uuid not null references public.email_contacts(id) on delete cascade,
  email text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  resend_id text,
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  first_opened_at timestamptz,
  open_count integer not null default 0,
  first_clicked_at timestamptz,
  click_count integer not null default 0,
  bounced_at timestamptz,
  complained_at timestamptz,
  last_event text,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create index if not exists email_campaign_sends_queue_idx on public.email_campaign_sends (campaign_id, status);
create index if not exists email_campaign_sends_resend_idx on public.email_campaign_sends (resend_id);
create index if not exists email_campaign_sends_sent_idx on public.email_campaign_sends (sent_at);

alter table public.email_campaigns enable row level security;
alter table public.email_campaign_sends enable row level security;

revoke all on table public.email_campaigns, public.email_campaign_sends from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.email_campaigns, public.email_campaign_sends to service_role;

comment on table public.email_campaigns is 'One-off email campaigns to a segment. Service role only.';
comment on table public.email_campaign_sends is 'One row per recipient of a campaign, with delivery and engagement. Service role only.';

notify pgrst, 'reload schema';
