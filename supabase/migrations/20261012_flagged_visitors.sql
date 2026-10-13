-- Visitors with an unusually high number of outbound clicks (scrapers, link checkers, one person
-- opening dozens of stores) are flagged and excluded from analytics headline numbers, brand
-- reports and product popularity. Rows keep being recorded; they are just marked excluded = true.
--
-- A visitor is flagged automatically when they reach 10 outbound clicks inside 24 hours (the
-- busiest real visitor so far had 6 in a day). An admin can mark a flagged visitor "allowed" to
-- count them again, or flag anyone manually, from /admin/analytics/flagged.

alter table public.site_events add column if not exists excluded boolean not null default false;
alter table public.outbound_clicks add column if not exists excluded boolean not null default false;

create index if not exists outbound_clicks_visitor_created_idx on public.outbound_clicks (anonymous_user_id, created_at desc);

create table if not exists public.analytics_flagged_visitors (
  anonymous_user_id text primary key,
  status text not null default 'flagged' check (status in ('flagged', 'allowed')),
  reason text,
  auto boolean not null default true,
  clicks_24h integer,
  flagged_at timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.analytics_flagged_visitors enable row level security;
revoke all on table public.analytics_flagged_visitors from public, anon, authenticated;
grant select, insert, update, delete on public.analytics_flagged_visitors to service_role;

-- New rows from an already-flagged visitor are excluded on the way in.
create or replace function public.mark_excluded_on_insert() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.analytics_flagged_visitors f where f.anonymous_user_id = new.anonymous_user_id and f.status = 'flagged') then
    new.excluded := true;
  end if;
  return new;
end;
$$;

drop trigger if exists site_events_mark_excluded on public.site_events;
create trigger site_events_mark_excluded before insert on public.site_events
  for each row execute function public.mark_excluded_on_insert();

drop trigger if exists outbound_clicks_mark_excluded on public.outbound_clicks;
create trigger outbound_clicks_mark_excluded before insert on public.outbound_clicks
  for each row execute function public.mark_excluded_on_insert();

-- Flag on the click that crosses the threshold, then exclude everything that visitor has recorded.
create or replace function public.flag_outlier_visitor() returns trigger
language plpgsql as $$
declare
  st text;
  n integer;
begin
  select status into st from public.analytics_flagged_visitors where anonymous_user_id = new.anonymous_user_id;
  if st = 'allowed' then return null; end if;
  if st is null then
    select count(*) into n from public.outbound_clicks
      where anonymous_user_id = new.anonymous_user_id and created_at > now() - interval '24 hours';
    if n >= 10 then
      insert into public.analytics_flagged_visitors (anonymous_user_id, status, reason, auto, clicks_24h)
        values (new.anonymous_user_id, 'flagged', n || ' outbound clicks in 24 hours', true, n)
        on conflict (anonymous_user_id) do nothing;
      st := 'flagged';
    end if;
  end if;
  if st = 'flagged' then
    update public.outbound_clicks set excluded = true where anonymous_user_id = new.anonymous_user_id and not excluded;
    update public.site_events set excluded = true where anonymous_user_id = new.anonymous_user_id and not excluded;
  end if;
  return null;
end;
$$;

drop trigger if exists outbound_clicks_flag_outlier on public.outbound_clicks;
create trigger outbound_clicks_flag_outlier after insert on public.outbound_clicks
  for each row execute function public.flag_outlier_visitor();

-- Admin override: p_status = 'flagged' excludes the visitor, 'allowed' counts them again.
create or replace function public.set_visitor_flag(p_visitor text, p_status text) returns void
language plpgsql as $$
begin
  if p_status not in ('flagged', 'allowed') then raise exception 'bad status'; end if;
  insert into public.analytics_flagged_visitors (anonymous_user_id, status, reason, auto, reviewed_at)
    values (p_visitor, p_status, case when p_status = 'flagged' then 'Flagged by an admin' else 'Allowed by an admin' end, false, now())
    on conflict (anonymous_user_id) do update set status = excluded.status, reviewed_at = now(), auto = false,
      reason = case when excluded.status = 'flagged' then 'Flagged by an admin' else 'Allowed by an admin' end;
  update public.outbound_clicks set excluded = (p_status = 'flagged') where anonymous_user_id = p_visitor;
  update public.site_events set excluded = (p_status = 'flagged') where anonymous_user_id = p_visitor;
end;
$$;
revoke all on function public.set_visitor_flag(text, text) from public, anon, authenticated;
grant execute on function public.set_visitor_flag(text, text) to service_role;

-- Backfill: anyone who already has 10+ outbound clicks in a UTC day.
insert into public.analytics_flagged_visitors (anonymous_user_id, status, reason, auto, clicks_24h)
select anonymous_user_id, 'flagged', max(c) || ' outbound clicks in a day', true, max(c)::integer
from (
  select anonymous_user_id, (created_at at time zone 'utc')::date d, count(*) c
  from public.outbound_clicks group by 1, 2 having count(*) >= 10
) t group by anonymous_user_id
on conflict (anonymous_user_id) do nothing;

update public.outbound_clicks o set excluded = true
  where exists (select 1 from public.analytics_flagged_visitors f where f.anonymous_user_id = o.anonymous_user_id and f.status = 'flagged');
update public.site_events s set excluded = true
  where exists (select 1 from public.analytics_flagged_visitors f where f.anonymous_user_id = s.anonymous_user_id and f.status = 'flagged');

notify pgrst, 'reload schema';
