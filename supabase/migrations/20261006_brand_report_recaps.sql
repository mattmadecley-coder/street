-- Brand reports can now be a one-off "recap" covering several days, not just
-- a single day. report_date stays the last day covered; period_start is the
-- first day (null for daily reports). A brand can have a daily report and a
-- recap ending on the same day, so the uniqueness key includes kind.
alter table public.brand_report_emails
  add column if not exists kind text not null default 'daily' check (kind in ('daily', 'recap')),
  add column if not exists period_start date;

alter table public.brand_report_emails drop constraint if exists brand_report_emails_brand_id_report_date_key;
create unique index if not exists brand_report_emails_brand_date_kind_key
  on public.brand_report_emails (brand_id, report_date, kind);

notify pgrst, 'reload schema';
