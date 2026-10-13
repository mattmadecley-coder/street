-- Email marketing to Street's own customers (separate from brand_report_emails,
-- which is outreach to brands). One profile per email address, an activity
-- timeline per profile, popup settings, and popup funnel events.

create table if not exists public.email_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  phone text,
  phone_added_at timestamptz,
  status text not null default 'subscribed'
    check (status in ('subscribed', 'unsubscribed', 'bounced', 'complained')),
  source text,                              -- e.g. 'popup'
  signup_path text,                         -- page they were on
  device_type text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  -- Anonymous browser ids (site_events.anonymous_user_id) that belong to this
  -- person, so on-site activity can be shown on their profile.
  anonymous_ids text[] not null default '{}',
  tags text[] not null default '{}',
  consent_email_at timestamptz,
  consent_sms_at timestamptz,
  consent_ip text,
  -- Random token for the unsubscribe link and for finishing the popup's phone step.
  token uuid not null default gen_random_uuid() unique,
  -- Rolled-up engagement, kept current by the Resend webhook.
  emails_sent integer not null default 0,
  open_count integer not null default 0,
  click_count integer not null default 0,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  last_clicked_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists email_contacts_email_key on public.email_contacts (lower(email));
create index if not exists email_contacts_created_idx on public.email_contacts (created_at desc);
create index if not exists email_contacts_status_idx on public.email_contacts (status);

create table if not exists public.email_contact_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.email_contacts(id) on delete cascade,
  type text not null,                       -- signed_up, phone_added, unsubscribed, email_sent, delivered, opened, clicked, bounced, complained
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists email_contact_events_contact_idx on public.email_contact_events (contact_id, created_at desc);
create index if not exists email_contact_events_type_idx on public.email_contact_events (type, created_at desc);

-- Single row of popup settings (edited at /admin/email/popup).
create table if not exists public.email_popup_settings (
  id integer primary key default 1 check (id = 1),
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Popup funnel: shown, closed, email_submitted, phone_submitted, skipped_phone.
create table if not exists public.email_popup_events (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  anonymous_id text,
  path text,
  device_type text,
  created_at timestamptz not null default now()
);

create index if not exists email_popup_events_created_idx on public.email_popup_events (created_at desc, type);

alter table public.email_contacts enable row level security;
alter table public.email_contact_events enable row level security;
alter table public.email_popup_settings enable row level security;
alter table public.email_popup_events enable row level security;
revoke all on table public.email_contacts, public.email_contact_events, public.email_popup_settings, public.email_popup_events from anon, authenticated;
grant all on table public.email_contacts, public.email_contact_events, public.email_popup_settings, public.email_popup_events to service_role;

notify pgrst, 'reload schema';
