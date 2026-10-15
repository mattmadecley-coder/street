-- Automatic filter for crawler bursts that look like thousands of separate visitors.
--
-- On 2026-10-14 about 2,380 "visitors" arrived in four hours, every one reporting the same time zone
-- (Asia/Shanghai) and the same 1280px-wide screen, with no referrer, one page each, rotating between
-- Chrome/Edge/Firefox identities: a crawler running headless browsers. They passed the normal bot checks
-- because they execute JavaScript, so they inflated visitors, page views and funnel rates.
--
-- detect_bot_bursts() looks at the last hour or so and, when ONE fingerprint (time zone + screen width)
-- suddenly accounts for a large, mostly-unreferred, desktop-only, multi-browser crowd that this site has
-- never seen before, it records a rule and marks those rows excluded. Rows are never deleted; an admin
-- can release a rule from /admin/analytics/flagged. The insert triggers then exclude new rows that match.
--
-- Safe to apply more than once. Service role only.

create table if not exists public.analytics_bot_rules (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  timezone text not null,
  screen_width integer not null,
  reason text,
  visitors_at_detection integer,
  auto boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- Rules lapse on their own so a rule can never silently hide real visitors forever.
  expires_at timestamptz not null default (now() + interval '30 days'),
  released_at timestamptz
);

create index if not exists analytics_bot_rules_active_idx on public.analytics_bot_rules (active, expires_at);

alter table public.analytics_bot_rules enable row level security;
revoke all on table public.analytics_bot_rules from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.analytics_bot_rules to service_role;

-- New rows are excluded when: the visitor is flagged, OR the row matches an active bot rule,
-- OR (outbound clicks) the visitor already has excluded events.
create or replace function public.mark_excluded_on_insert() returns trigger
language plpgsql as $$
declare
  j jsonb := to_jsonb(new);
begin
  if exists (select 1 from public.analytics_flagged_visitors f where f.anonymous_user_id = new.anonymous_user_id and f.status = 'flagged') then
    new.excluded := true;
  end if;
  if not new.excluded then
    if j ? 'timezone' then
      if j->>'timezone' is not null and j->>'screen_width' is not null and exists (
        select 1 from public.analytics_bot_rules r
        where r.active and r.expires_at > now() and r.timezone = j->>'timezone' and r.screen_width = (j->>'screen_width')::integer
      ) then
        new.excluded := true;
      end if;
    elsif tg_table_name = 'outbound_clicks' and new.anonymous_user_id is not null then
      if exists (select 1 from public.site_events e where e.anonymous_user_id = new.anonymous_user_id and e.excluded and e.created_at > now() - interval '8 days') then
        new.excluded := true;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Returns a JSON array describing any rules created this run (empty array when nothing was found).
create or replace function public.detect_bot_bursts(p_window interval default interval '90 minutes', p_min_visitors integer default 100)
returns jsonb
language plpgsql as $$
declare
  rec record;
  total_visitors integer;
  out jsonb := '[]'::jsonb;
  rule_id uuid;
  hit_rows integer;
begin
  select count(distinct anonymous_user_id) into total_visitors
    from public.site_events
    where created_at > now() - p_window and not excluded and anonymous_user_id is not null;

  for rec in
    select g.timezone, g.screen_width, g.visitors, g.families
    from (
      select timezone, screen_width,
             count(distinct anonymous_user_id) as visitors,
             count(distinct coalesce(browser, '') || '/' || coalesce(operating_system, '')) as families,
             avg(case when referrer is null or referrer = '' then 1 else 0 end) as no_referrer_share,
             avg(case when coalesce(device_type, '') in ('mobile', 'tablet') then 0 else 1 end) as desktop_share
      from public.site_events
      where created_at > now() - p_window and not excluded and event_type = 'page_view'
        and timezone is not null and screen_width is not null and anonymous_user_id is not null
      group by timezone, screen_width
    ) g
    where g.visitors >= p_min_visitors
      and g.families >= 3
      and g.no_referrer_share >= 0.9
      and g.desktop_share >= 0.9
      and g.visitors >= 0.5 * total_visitors
      -- Brand new to this site: the same fingerprint barely appeared in the previous week.
      and (
        select count(distinct s.anonymous_user_id) from public.site_events s
        where s.event_type = 'page_view' and s.timezone = g.timezone and s.screen_width = g.screen_width
          and s.created_at > now() - interval '8 days' and s.created_at <= now() - p_window
      ) < greatest(10, g.visitors * 0.1)
      and not exists (
        select 1 from public.analytics_bot_rules r
        where r.active and r.expires_at > now() and r.timezone = g.timezone and r.screen_width = g.screen_width
      )
  loop
    insert into public.analytics_bot_rules (label, timezone, screen_width, reason, visitors_at_detection)
      values (
        'Automated burst: ' || rec.timezone || ', ' || rec.screen_width || 'px screen',
        rec.timezone, rec.screen_width,
        rec.visitors || ' visitors in ' || to_char(p_window, 'HH24:MI') || ' sharing one time zone and screen width, no referrer, one page each, across ' || rec.families || ' browser identities',
        rec.visitors
      )
      returning id into rule_id;

    update public.site_events set excluded = true
      where created_at > now() - interval '8 days' and timezone = rec.timezone and screen_width = rec.screen_width and not excluded;
    get diagnostics hit_rows = row_count;

    update public.outbound_clicks set excluded = true
      where created_at > now() - interval '8 days' and not excluded
        and anonymous_user_id in (
          select distinct anonymous_user_id from public.site_events
          where created_at > now() - interval '8 days' and timezone = rec.timezone and screen_width = rec.screen_width and anonymous_user_id is not null
        );

    out := out || jsonb_build_object('id', rule_id, 'timezone', rec.timezone, 'screen_width', rec.screen_width, 'visitors', rec.visitors, 'rows_excluded', hit_rows);
  end loop;

  return out;
end;
$$;

-- Admin override: stop a rule and count its visitors again (unless they are flagged for another reason).
create or replace function public.release_bot_rule(p_id uuid) returns void
language plpgsql as $$
declare
  r public.analytics_bot_rules;
begin
  select * into r from public.analytics_bot_rules where id = p_id;
  if not found then return; end if;
  update public.analytics_bot_rules set active = false, released_at = now() where id = p_id;
  update public.site_events s set excluded = false
    where s.created_at > now() - interval '30 days' and s.timezone = r.timezone and s.screen_width = r.screen_width and s.excluded
      and not exists (select 1 from public.analytics_flagged_visitors f where f.anonymous_user_id = s.anonymous_user_id and f.status = 'flagged');
  update public.outbound_clicks o set excluded = false
    where o.created_at > now() - interval '30 days' and o.excluded
      and o.anonymous_user_id in (select distinct anonymous_user_id from public.site_events where timezone = r.timezone and screen_width = r.screen_width and anonymous_user_id is not null)
      and not exists (select 1 from public.analytics_flagged_visitors f where f.anonymous_user_id = o.anonymous_user_id and f.status = 'flagged');
end;
$$;

revoke all on function public.detect_bot_bursts(interval, integer) from public, anon, authenticated;
revoke all on function public.release_bot_rule(uuid) from public, anon, authenticated;
grant execute on function public.detect_bot_bursts(interval, integer) to service_role;
grant execute on function public.release_bot_rule(uuid) to service_role;

comment on table public.analytics_bot_rules is 'Fingerprint rules that exclude automated traffic bursts from analytics. Service role only.';

notify pgrst, 'reload schema';
