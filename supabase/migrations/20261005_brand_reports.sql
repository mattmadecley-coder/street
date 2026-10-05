-- Daily "we sent you shoppers" report emails to brands.
--
-- Contact details live in their own table, NOT as columns on brands:
-- brands is readable by the public anon role (RLS policy "public can read
-- active brands"), which would expose scraped addresses and unsubscribe
-- tokens through the public PostgREST API.

-- Undo an earlier draft of this migration that briefly added these to brands.
drop index if exists public.brands_report_token_key;
alter table public.brands
  drop column if exists contact_email,
  drop column if exists contact_email_source,
  drop column if exists contact_email_checked_at,
  drop column if exists reports_opted_out_at,
  drop column if exists report_token;

create table if not exists public.brand_contacts (
  brand_id uuid primary key references public.brands(id) on delete cascade,
  contact_email text,
  contact_email_source text,
  contact_email_checked_at timestamptz,
  reports_opted_out_at timestamptz,
  -- Random per-brand token for the unsubscribe link, so it can't be guessed.
  report_token uuid not null default gen_random_uuid() unique,
  updated_at timestamptz not null default now()
);

alter table public.brand_contacts enable row level security;
revoke all on table public.brand_contacts from anon, authenticated;
grant all on table public.brand_contacts to service_role;

-- One row per brand per report day. Drafts wait for approval in
-- /admin/reports unless BRAND_REPORTS_AUTO_SEND=1.
create table if not exists public.brand_report_emails (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  report_date date not null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'skipped', 'failed')),
  to_email text,
  subject text not null,
  html text not null,
  text_body text not null,
  stats jsonb not null default '{}'::jsonb,
  is_first boolean not null default false,
  resend_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (brand_id, report_date)
);

create index if not exists brand_report_emails_date_idx on public.brand_report_emails (report_date desc);

alter table public.brand_report_emails enable row level security;
revoke all on table public.brand_report_emails from anon, authenticated;
grant all on table public.brand_report_emails to service_role;

notify pgrst, 'reload schema';
