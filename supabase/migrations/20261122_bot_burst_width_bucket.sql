-- Widens detect_bot_bursts() so a crawler that randomizes its reported screen
-- width per visit can still be caught, and adds the index the admin
-- analytics/flagged pages need to stay fast once a burst has been excluded.
--
-- Context (2026-11-19/22 incident): the Oct 14 crawler wave that
-- 20261021_bot_burst_rules.sql was built for shared one exact (timezone,
-- screen_width) fingerprint across thousands of visitors, which is exactly
-- what that function groups by. This wave rolled a slightly different
-- screen_width on every single visit (1834px, 1767px, 1845px, 1825px, ...),
-- so no single (timezone, screen_width) pair ever reached p_min_visitors --
-- the exact-match GROUP BY silently let the whole wave through. ~6,200
-- visitors from that window were flagged by hand afterward
-- (set_visitor_flag, one call per visitor) rather than by this function.
--
-- The fix: group by a screen-width *bucket* (round to the nearest 50px)
-- instead of the exact pixel value, so a crawler that jitters its reported
-- width by a few dozen pixels per visit still lands in one bucket. The
-- app-level real-time guard added alongside this migration
-- (lib/bot-guard.ts: trackEventForBurstGuard) independently catches the
-- same wave's broken-image-flood signature per session, without needing a
-- volume threshold at all -- these two are complementary, not redundant:
-- the DB-side function catches "many visitors, one fingerprint, over time";
-- the app-side guard catches "one session, clearly automated, right now."
--
-- Safe to apply more than once.

create or replace function public.detect_bot_bursts(p_window interval default interval '90 minutes', p_min_visitors integer default 100)
returns jsonb
language plpgsql as $$
declare
  rec record;
  total_visitors integer;
  out jsonb := '[]'::jsonb;
  rule_id uuid;
  hit_rows integer;
  bucket_low integer;
  bucket_high integer;
begin
  select count(distinct anonymous_user_id) into total_visitors
    from public.site_events
    where created_at > now() - p_window and not excluded and anonymous_user_id is not null;

  for rec in
    select g.timezone, g.screen_bucket, g.visitors, g.families
    from (
      select timezone, (round(screen_width / 50.0) * 50)::integer as screen_bucket,
             count(distinct anonymous_user_id) as visitors,
             count(distinct coalesce(browser, '') || '/' || coalesce(operating_system, '')) as families,
             avg(case when referrer is null or referrer = '' then 1 else 0 end) as no_referrer_share,
             avg(case when coalesce(device_type, '') in ('mobile', 'tablet') then 0 else 1 end) as desktop_share
      from public.site_events
      where created_at > now() - p_window and not excluded and event_type = 'page_view'
        and timezone is not null and screen_width is not null and anonymous_user_id is not null
      group by timezone, (round(screen_width / 50.0) * 50)::integer
    ) g
    where g.visitors >= p_min_visitors
      and g.families >= 3
      and g.no_referrer_share >= 0.9
      and g.desktop_share >= 0.9
      and g.visitors >= 0.5 * total_visitors
      -- Brand new to this site: the same fingerprint bucket barely appeared in the previous week.
      and (
        select count(distinct s.anonymous_user_id) from public.site_events s
        where s.event_type = 'page_view' and s.timezone = g.timezone
          and (round(s.screen_width / 50.0) * 50)::integer = g.screen_bucket
          and s.created_at > now() - interval '8 days' and s.created_at <= now() - p_window
      ) < greatest(10, g.visitors * 0.1)
      and not exists (
        select 1 from public.analytics_bot_rules r
        where r.active and r.expires_at > now() and r.timezone = g.timezone
          and r.screen_width between g.screen_bucket - 24 and g.screen_bucket + 24
      )
  loop
    bucket_low := rec.screen_bucket - 24;
    bucket_high := rec.screen_bucket + 24;

    insert into public.analytics_bot_rules (label, timezone, screen_width, reason, visitors_at_detection)
      values (
        'Automated burst: ' || rec.timezone || ', ~' || rec.screen_bucket || 'px screen',
        rec.timezone, rec.screen_bucket,
        rec.visitors || ' visitors in ' || to_char(p_window, 'HH24:MI') || ' sharing one time zone and a ' || bucket_low || '-' || bucket_high ||
          'px screen-width band, no referrer, one page each, across ' || rec.families || ' browser identities',
        rec.visitors
      )
      returning id into rule_id;

    update public.site_events set excluded = true
      where created_at > now() - interval '8 days' and timezone = rec.timezone
        and screen_width between bucket_low and bucket_high and not excluded;
    get diagnostics hit_rows = row_count;

    update public.outbound_clicks set excluded = true
      where created_at > now() - interval '8 days' and not excluded
        and anonymous_user_id in (
          select distinct anonymous_user_id from public.site_events
          where created_at > now() - interval '8 days' and timezone = rec.timezone
            and screen_width between bucket_low and bucket_high and anonymous_user_id is not null
        );

    out := out || jsonb_build_object('id', rule_id, 'timezone', rec.timezone, 'screen_width', rec.screen_bucket, 'visitors', rec.visitors, 'rows_excluded', hit_rows);
  end loop;

  return out;
end;
$$;

-- mark_excluded_on_insert currently matches new rows against an active rule
-- by exact screen_width; widen that to the same +/-24px band the detector
-- above now uses, so new rows from an already-detected bucketed burst keep
-- getting excluded on insert, not just the rows that existed at detection time.
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
        where r.active and r.expires_at > now() and r.timezone = j->>'timezone'
          and (j->>'screen_width')::integer between r.screen_width - 24 and r.screen_width + 24
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

-- Performance: /admin/analytics and /admin/analytics/flagged both filter
-- site_events by (excluded, created_at) on every load (see lib/analytics.ts
-- getRecentSiteEvents, and the per-visitor counts on the flagged page). The
-- 2026-11-22 bot cleanup alone flagged ~6,200 visitors in one pass, and any
-- future burst will too -- without this index each such filter is a
-- sequential scan over the whole table.
create index if not exists site_events_excluded_created_idx on public.site_events (excluded, created_at desc);
create index if not exists site_events_anonymous_user_idx on public.site_events (anonymous_user_id);
create index if not exists outbound_clicks_anonymous_user_idx on public.outbound_clicks (anonymous_user_id);
