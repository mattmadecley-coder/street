-- Daily analytics roll-up: one small row per reporting day and time zone, written once a day by
-- /api/cron/daily from the raw events (same definitions as the dashboard: likely-human visitors,
-- sessions, outbound clicks, intent value). Lets long date ranges draw an exact day-by-day chart even
-- when there are more raw events than the dashboard can load at once.
--
-- Safe to apply more than once. The admin treats a missing table as "roll-ups not enabled yet".
-- Internal operating data: service role only.

create table if not exists public.analytics_daily (
  tz text not null,
  day date not null,
  visitors integer not null default 0,
  recorded_visitors integer not null default 0,
  sessions integer not null default 0,
  outbound_clicks integer not null default 0,
  intent_value numeric(12, 2) not null default 0,
  computed_at timestamptz not null default now(),
  primary key (tz, day)
);

alter table public.analytics_daily enable row level security;

-- No policies on purpose; revoke the default grants, then give the service role only what it needs.
revoke all on table public.analytics_daily from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.analytics_daily to service_role;

comment on table public.analytics_daily is
  'One row per reporting day and time zone, rebuilt from raw events by the daily cron. Service role only.';
