-- The admin analytics "comparison", "alerts", per-brand, and "growth" pages
-- (app/admin/analytics/comparison, alerts, brands/[slug], growth) have read
-- from these five views since they were written, but no migration ever
-- created them -- a 2026-10-01 live-database review (Codex) found the public
-- schema has catalog_product_popularity as the only regular view and none of
-- these. The application code swallows the resulting PostgREST errors and
-- silently renders empty/zero state instead of surfacing the gap, so this
-- has likely been broken since those pages shipped.
--
-- These are plain (non-materialized) views over site_events/outbound_clicks,
-- so they're always current -- no refresh job to schedule or forget. "day"
-- buckets are UTC calendar days (created_at AT TIME ZONE 'utc')::date,
-- matching how the TypeScript callers build their `since`/`day` cutoffs
-- (lib/analytics.ts cacheFriendlySince, and the comparison/brand pages'
-- `new Date(...).toISOString().slice(0, 10)`) -- both are plain UTC-date
-- arithmetic, not Eastern-Time-aware like the main overview page's trend
-- chart (lib/analytics-audience.ts), so this intentionally does not convert
-- to America/New_York.
--
-- Counts here are raw "recorded" totals (every anonymous_user_id/session_id
-- with a qualifying event), matching how these specific pages already label
-- their numbers ("Recorded visitors", "Sessions (daily total)") -- they do
-- not apply the bot/likely-human filtering that lib/analytics-audience.ts
-- does for the main overview page's trend chart. That is a separate, larger
-- change (tracked as its own follow-up) and out of scope for restoring these
-- already-referenced views to existence.
create or replace view public.analytics_daily_summary
with (security_invoker = true)
as
with days as (
  select distinct (created_at at time zone 'utc')::date as day from public.site_events
  union
  select distinct (created_at at time zone 'utc')::date as day from public.outbound_clicks
),
events_by_day as (
  select
    (created_at at time zone 'utc')::date as day,
    count(*) as events,
    count(distinct anonymous_user_id) as visitors,
    count(distinct session_id) as sessions,
    count(*) filter (where event_type = 'page_view') as page_views,
    count(*) filter (where event_type = 'product_impression') as product_impressions,
    count(*) filter (where event_type = 'product_click') as product_clicks,
    count(*) filter (where event_type = 'product_view') as product_views,
    count(*) filter (where event_type = 'search') as searches,
    count(*) filter (where event_type = 'search' and coalesce(results_count, 0) = 0) as zero_result_searches,
    count(*) filter (where event_type in ('javascript_error', 'unhandled_rejection', 'broken_image')) as technical_errors,
    avg((metadata ->> 'loadMs')::numeric) filter (where event_type = 'page_performance' and metadata ? 'loadMs') as average_load_ms
  from public.site_events
  group by 1
),
outbound_by_day as (
  select
    (created_at at time zone 'utc')::date as day,
    count(*) as outbound_clicks,
    count(distinct session_id) as outbound_sessions
  from public.outbound_clicks
  group by 1
)
select
  d.day,
  coalesce(e.events, 0) as events,
  coalesce(e.visitors, 0) as visitors,
  coalesce(e.sessions, 0) as sessions,
  coalesce(e.page_views, 0) as page_views,
  coalesce(e.product_impressions, 0) as product_impressions,
  coalesce(e.product_clicks, 0) as product_clicks,
  coalesce(e.product_views, 0) as product_views,
  coalesce(e.searches, 0) as searches,
  coalesce(e.zero_result_searches, 0) as zero_result_searches,
  coalesce(o.outbound_clicks, 0) as outbound_clicks,
  coalesce(o.outbound_sessions, 0) as outbound_sessions,
  coalesce(e.technical_errors, 0) as technical_errors,
  e.average_load_ms
from days d
left join events_by_day e on e.day = d.day
left join outbound_by_day o on o.day = d.day;

comment on view public.analytics_daily_summary is
  'Site-wide recorded (unfiltered) daily totals backing /admin/analytics/comparison and /admin/analytics/alerts.';

create or replace view public.analytics_brand_daily
with (security_invoker = true)
as
with days as (
  select distinct (created_at at time zone 'utc')::date as day, brand_slug from public.site_events where brand_slug is not null
  union
  select distinct (created_at at time zone 'utc')::date as day, brand_slug from public.outbound_clicks where brand_slug is not null
),
events_by_day as (
  select
    (created_at at time zone 'utc')::date as day,
    brand_slug,
    count(*) filter (where event_type = 'product_impression') as impressions,
    count(*) filter (where event_type = 'product_click') as product_clicks,
    count(*) filter (where event_type = 'product_view') as product_views,
    count(distinct session_id) as sessions
  from public.site_events
  where brand_slug is not null
  group by 1, 2
),
outbound_by_day as (
  select
    (created_at at time zone 'utc')::date as day,
    brand_slug,
    count(*) as outbound_clicks,
    count(distinct session_id) as outbound_sessions
  from public.outbound_clicks
  where brand_slug is not null
  group by 1, 2
)
select
  d.day,
  d.brand_slug,
  coalesce(e.impressions, 0) as impressions,
  coalesce(e.product_clicks, 0) as product_clicks,
  coalesce(e.product_views, 0) as product_views,
  coalesce(e.sessions, 0) as sessions,
  coalesce(o.outbound_clicks, 0) as outbound_clicks,
  coalesce(o.outbound_sessions, 0) as outbound_sessions
from days d
left join events_by_day e on e.day = d.day and e.brand_slug = d.brand_slug
left join outbound_by_day o on o.day = d.day and o.brand_slug = d.brand_slug;

comment on view public.analytics_brand_daily is
  'Per-brand recorded daily totals backing /admin/analytics/brands/[slug].';

create or replace view public.analytics_search_daily
with (security_invoker = true)
as
with search_events as (
  select
    (created_at at time zone 'utc')::date as day,
    lower(btrim(query)) as query,
    count(*) as searches,
    count(*) filter (where coalesce(results_count, 0) = 0) as zero_result_searches,
    coalesce(sum(results_count), 0) as total_results
  from public.site_events
  where event_type = 'search' and query is not null and btrim(query) <> ''
  group by 1, 2
),
search_clicks as (
  select
    (created_at at time zone 'utc')::date as day,
    lower(btrim(query)) as query,
    count(*) as search_clicks
  from public.site_events
  where event_type = 'search_click' and query is not null and btrim(query) <> ''
  group by 1, 2
),
search_outbound as (
  select
    (created_at at time zone 'utc')::date as day,
    lower(btrim(search_query)) as query,
    count(*) as outbound_clicks,
    count(distinct session_id) as outbound_sessions
  from public.outbound_clicks
  where search_query is not null and btrim(search_query) <> ''
  group by 1, 2
)
select
  coalesce(se.day, sc.day, so.day) as day,
  coalesce(se.query, sc.query, so.query) as query,
  coalesce(se.searches, 0) as searches,
  coalesce(se.zero_result_searches, 0) as zero_result_searches,
  coalesce(se.total_results, 0) as total_results,
  coalesce(sc.search_clicks, 0) as search_clicks,
  coalesce(so.outbound_clicks, 0) as outbound_clicks,
  coalesce(so.outbound_sessions, 0) as outbound_sessions
from search_events se
full outer join search_clicks sc on sc.day = se.day and sc.query = se.query
full outer join search_outbound so
  on so.day = coalesce(se.day, sc.day) and so.query = coalesce(se.query, sc.query);

comment on view public.analytics_search_daily is
  'Search demand/outcome daily totals backing /admin/analytics/growth (attributed via outbound_clicks.search_query).';

create or replace view public.analytics_campaign_daily
with (security_invoker = true)
as
with events_by_day as (
  select
    (created_at at time zone 'utc')::date as day,
    coalesce(utm_source, '') as utm_source,
    coalesce(utm_medium, '') as utm_medium,
    coalesce(utm_campaign, '') as utm_campaign,
    coalesce(utm_content, '') as utm_content,
    count(distinct anonymous_user_id) as visitors,
    count(distinct session_id) as sessions,
    count(*) filter (where event_type = 'page_view') as page_views,
    count(*) filter (where event_type = 'product_view') as product_views,
    count(*) filter (where event_type = 'search') as searches
  from public.site_events
  where coalesce(utm_source, '') <> '' or coalesce(utm_medium, '') <> '' or coalesce(utm_campaign, '') <> '' or coalesce(utm_content, '') <> ''
  group by 1, 2, 3, 4, 5
),
outbound_by_day as (
  select
    (created_at at time zone 'utc')::date as day,
    coalesce(utm_source, '') as utm_source,
    coalesce(utm_medium, '') as utm_medium,
    coalesce(utm_campaign, '') as utm_campaign,
    count(*) as outbound_clicks,
    count(distinct session_id) as outbound_sessions
  from public.outbound_clicks
  where coalesce(utm_source, '') <> '' or coalesce(utm_medium, '') <> '' or coalesce(utm_campaign, '') <> ''
  group by 1, 2, 3, 4
)
select
  coalesce(e.day, o.day) as day,
  coalesce(e.utm_source, o.utm_source, '') as utm_source,
  coalesce(e.utm_medium, o.utm_medium, '') as utm_medium,
  coalesce(e.utm_campaign, o.utm_campaign, '') as utm_campaign,
  coalesce(e.utm_content, '') as utm_content,
  coalesce(e.visitors, 0) as visitors,
  coalesce(e.sessions, 0) as sessions,
  coalesce(e.page_views, 0) as page_views,
  coalesce(e.product_views, 0) as product_views,
  coalesce(e.searches, 0) as searches,
  coalesce(o.outbound_clicks, 0) as outbound_clicks,
  coalesce(o.outbound_sessions, 0) as outbound_sessions
from events_by_day e
full outer join outbound_by_day o
  on o.day = e.day and o.utm_source = e.utm_source and o.utm_medium = e.utm_medium and o.utm_campaign = e.utm_campaign;

comment on view public.analytics_campaign_daily is
  'UTM-attributed daily totals backing /admin/analytics/growth campaign table. outbound_clicks has no utm_content column, so outbound rows join on source/medium/campaign only.';

create or replace view public.analytics_position_daily
with (security_invoker = true)
as
select
  (created_at at time zone 'utc')::date as day,
  coalesce(source_component, 'unknown') as source_component,
  coalesce(position, 0) as position,
  count(*) filter (where event_type = 'product_impression') as impressions,
  count(*) filter (where event_type = 'product_click') as product_clicks,
  count(distinct session_id) filter (where event_type = 'product_impression') as impression_sessions,
  count(distinct session_id) filter (where event_type = 'product_click') as click_sessions
from public.site_events
where event_type in ('product_impression', 'product_click')
group by 1, 2, 3;

comment on view public.analytics_position_daily is
  'Product-card placement performance backing /admin/analytics/growth position table.';

-- Same access pattern as catalog_product_popularity (20260719): these sit
-- behind RLS-enabled base tables with no anon/authenticated policies, so
-- security_invoker views naturally return nothing for those roles already.
-- Lock that down explicitly and match how every other admin analytics read
-- reaches Postgres (the service-role key only).
revoke all on table public.analytics_daily_summary from public, anon, authenticated;
revoke all on table public.analytics_brand_daily from public, anon, authenticated;
revoke all on table public.analytics_search_daily from public, anon, authenticated;
revoke all on table public.analytics_campaign_daily from public, anon, authenticated;
revoke all on table public.analytics_position_daily from public, anon, authenticated;

grant select on public.analytics_daily_summary to service_role;
grant select on public.analytics_brand_daily to service_role;
grant select on public.analytics_search_daily to service_role;
grant select on public.analytics_campaign_daily to service_role;
grant select on public.analytics_position_daily to service_role;
