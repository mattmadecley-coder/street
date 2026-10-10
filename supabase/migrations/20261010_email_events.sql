-- Delivery / open / bounce tracking for brand report emails, filled in by the
-- Resend webhook (app/api/webhooks/resend).
alter table public.brand_report_emails
  add column if not exists delivered_at timestamptz,
  add column if not exists first_opened_at timestamptz,
  add column if not exists last_opened_at timestamptz,
  add column if not exists open_count integer not null default 0,
  add column if not exists first_clicked_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists complained_at timestamptz,
  add column if not exists last_event text,
  add column if not exists last_event_at timestamptz;

create index if not exists brand_report_emails_resend_id_idx on public.brand_report_emails (resend_id);

notify pgrst, 'reload schema';
