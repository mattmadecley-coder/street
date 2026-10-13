create or replace view public.analytics_brand_daily as
WITH days AS (
         SELECT DISTINCT (site_events.created_at AT TIME ZONE 'utc'::text)::date AS day,
            site_events.brand_slug
           FROM (SELECT * FROM public.site_events WHERE NOT excluded) site_events
          WHERE site_events.brand_slug IS NOT NULL
        UNION
         SELECT DISTINCT (outbound_clicks.created_at AT TIME ZONE 'utc'::text)::date AS day,
            outbound_clicks.brand_slug
           FROM (SELECT * FROM public.outbound_clicks WHERE NOT excluded) outbound_clicks
          WHERE outbound_clicks.brand_slug IS NOT NULL
        ), events_by_day AS (
         SELECT (site_events.created_at AT TIME ZONE 'utc'::text)::date AS day,
            site_events.brand_slug,
            count(*) FILTER (WHERE site_events.event_type = 'product_impression'::text) AS impressions,
            count(*) FILTER (WHERE site_events.event_type = 'product_click'::text) AS product_clicks,
            count(*) FILTER (WHERE site_events.event_type = 'product_view'::text) AS product_views,
            count(DISTINCT site_events.session_id) AS sessions
           FROM (SELECT * FROM public.site_events WHERE NOT excluded) site_events
          WHERE site_events.brand_slug IS NOT NULL
          GROUP BY ((site_events.created_at AT TIME ZONE 'utc'::text)::date), site_events.brand_slug
        ), outbound_by_day AS (
         SELECT (outbound_clicks.created_at AT TIME ZONE 'utc'::text)::date AS day,
            outbound_clicks.brand_slug,
            count(*) AS outbound_clicks,
            count(DISTINCT outbound_clicks.session_id) AS outbound_sessions
           FROM (SELECT * FROM public.outbound_clicks WHERE NOT excluded) outbound_clicks
          WHERE outbound_clicks.brand_slug IS NOT NULL
          GROUP BY ((outbound_clicks.created_at AT TIME ZONE 'utc'::text)::date), outbound_clicks.brand_slug
        )
 SELECT d.day,
    d.brand_slug,
    COALESCE(e.impressions, 0::bigint) AS impressions,
    COALESCE(e.product_clicks, 0::bigint) AS product_clicks,
    COALESCE(e.product_views, 0::bigint) AS product_views,
    COALESCE(e.sessions, 0::bigint) AS sessions,
    COALESCE(o.outbound_clicks, 0::bigint) AS outbound_clicks,
    COALESCE(o.outbound_sessions, 0::bigint) AS outbound_sessions
   FROM days d
     LEFT JOIN events_by_day e ON e.day = d.day AND e.brand_slug = d.brand_slug
     LEFT JOIN outbound_by_day o ON o.day = d.day AND o.brand_slug = d.brand_slug;

create or replace view public.analytics_campaign_daily as
WITH events_by_day AS (
         SELECT (site_events.created_at AT TIME ZONE 'utc'::text)::date AS day,
            COALESCE(site_events.utm_source, ''::text) AS utm_source,
            COALESCE(site_events.utm_medium, ''::text) AS utm_medium,
            COALESCE(site_events.utm_campaign, ''::text) AS utm_campaign,
            COALESCE(site_events.utm_content, ''::text) AS utm_content,
            count(DISTINCT site_events.anonymous_user_id) AS visitors,
            count(DISTINCT site_events.session_id) AS sessions,
            count(*) FILTER (WHERE site_events.event_type = 'page_view'::text) AS page_views,
            count(*) FILTER (WHERE site_events.event_type = 'product_view'::text) AS product_views,
            count(*) FILTER (WHERE site_events.event_type = 'search'::text) AS searches
           FROM (SELECT * FROM public.site_events WHERE NOT excluded) site_events
          WHERE COALESCE(site_events.utm_source, ''::text) <> ''::text OR COALESCE(site_events.utm_medium, ''::text) <> ''::text OR COALESCE(site_events.utm_campaign, ''::text) <> ''::text OR COALESCE(site_events.utm_content, ''::text) <> ''::text
          GROUP BY ((site_events.created_at AT TIME ZONE 'utc'::text)::date), (COALESCE(site_events.utm_source, ''::text)), (COALESCE(site_events.utm_medium, ''::text)), (COALESCE(site_events.utm_campaign, ''::text)), (COALESCE(site_events.utm_content, ''::text))
        ), outbound_by_day AS (
         SELECT (outbound_clicks.created_at AT TIME ZONE 'utc'::text)::date AS day,
            COALESCE(outbound_clicks.utm_source, ''::text) AS utm_source,
            COALESCE(outbound_clicks.utm_medium, ''::text) AS utm_medium,
            COALESCE(outbound_clicks.utm_campaign, ''::text) AS utm_campaign,
            count(*) AS outbound_clicks,
            count(DISTINCT outbound_clicks.session_id) AS outbound_sessions
           FROM (SELECT * FROM public.outbound_clicks WHERE NOT excluded) outbound_clicks
          WHERE COALESCE(outbound_clicks.utm_source, ''::text) <> ''::text OR COALESCE(outbound_clicks.utm_medium, ''::text) <> ''::text OR COALESCE(outbound_clicks.utm_campaign, ''::text) <> ''::text
          GROUP BY ((outbound_clicks.created_at AT TIME ZONE 'utc'::text)::date), (COALESCE(outbound_clicks.utm_source, ''::text)), (COALESCE(outbound_clicks.utm_medium, ''::text)), (COALESCE(outbound_clicks.utm_campaign, ''::text))
        )
 SELECT COALESCE(e.day, o.day) AS day,
    COALESCE(e.utm_source, o.utm_source, ''::text) AS utm_source,
    COALESCE(e.utm_medium, o.utm_medium, ''::text) AS utm_medium,
    COALESCE(e.utm_campaign, o.utm_campaign, ''::text) AS utm_campaign,
    COALESCE(e.utm_content, ''::text) AS utm_content,
    COALESCE(e.visitors, 0::bigint) AS visitors,
    COALESCE(e.sessions, 0::bigint) AS sessions,
    COALESCE(e.page_views, 0::bigint) AS page_views,
    COALESCE(e.product_views, 0::bigint) AS product_views,
    COALESCE(e.searches, 0::bigint) AS searches,
    COALESCE(o.outbound_clicks, 0::bigint) AS outbound_clicks,
    COALESCE(o.outbound_sessions, 0::bigint) AS outbound_sessions
   FROM events_by_day e
     FULL JOIN outbound_by_day o ON o.day = e.day AND o.utm_source = e.utm_source AND o.utm_medium = e.utm_medium AND o.utm_campaign = e.utm_campaign;

create or replace view public.analytics_daily_summary as
WITH days AS (
         SELECT DISTINCT (site_events.created_at AT TIME ZONE 'utc'::text)::date AS day
           FROM (SELECT * FROM public.site_events WHERE NOT excluded) site_events
        UNION
         SELECT DISTINCT (outbound_clicks.created_at AT TIME ZONE 'utc'::text)::date AS day
           FROM (SELECT * FROM public.outbound_clicks WHERE NOT excluded) outbound_clicks
        ), events_by_day AS (
         SELECT (site_events.created_at AT TIME ZONE 'utc'::text)::date AS day,
            count(*) AS events,
            count(DISTINCT site_events.anonymous_user_id) AS visitors,
            count(DISTINCT site_events.session_id) AS sessions,
            count(*) FILTER (WHERE site_events.event_type = 'page_view'::text) AS page_views,
            count(*) FILTER (WHERE site_events.event_type = 'product_impression'::text) AS product_impressions,
            count(*) FILTER (WHERE site_events.event_type = 'product_click'::text) AS product_clicks,
            count(*) FILTER (WHERE site_events.event_type = 'product_view'::text) AS product_views,
            count(*) FILTER (WHERE site_events.event_type = 'search'::text) AS searches,
            count(*) FILTER (WHERE site_events.event_type = 'search'::text AND COALESCE(site_events.results_count, 0) = 0) AS zero_result_searches,
            count(*) FILTER (WHERE site_events.event_type = ANY (ARRAY['javascript_error'::text, 'unhandled_rejection'::text, 'broken_image'::text])) AS technical_errors,
            avg((site_events.metadata ->> 'loadMs'::text)::numeric) FILTER (WHERE site_events.event_type = 'page_performance'::text AND site_events.metadata ? 'loadMs'::text) AS average_load_ms
           FROM (SELECT * FROM public.site_events WHERE NOT excluded) site_events
          GROUP BY ((site_events.created_at AT TIME ZONE 'utc'::text)::date)
        ), outbound_by_day AS (
         SELECT (outbound_clicks.created_at AT TIME ZONE 'utc'::text)::date AS day,
            count(*) AS outbound_clicks,
            count(DISTINCT outbound_clicks.session_id) AS outbound_sessions
           FROM (SELECT * FROM public.outbound_clicks WHERE NOT excluded) outbound_clicks
          GROUP BY ((outbound_clicks.created_at AT TIME ZONE 'utc'::text)::date)
        )
 SELECT d.day,
    COALESCE(e.events, 0::bigint) AS events,
    COALESCE(e.visitors, 0::bigint) AS visitors,
    COALESCE(e.sessions, 0::bigint) AS sessions,
    COALESCE(e.page_views, 0::bigint) AS page_views,
    COALESCE(e.product_impressions, 0::bigint) AS product_impressions,
    COALESCE(e.product_clicks, 0::bigint) AS product_clicks,
    COALESCE(e.product_views, 0::bigint) AS product_views,
    COALESCE(e.searches, 0::bigint) AS searches,
    COALESCE(e.zero_result_searches, 0::bigint) AS zero_result_searches,
    COALESCE(o.outbound_clicks, 0::bigint) AS outbound_clicks,
    COALESCE(o.outbound_sessions, 0::bigint) AS outbound_sessions,
    COALESCE(e.technical_errors, 0::bigint) AS technical_errors,
    e.average_load_ms
   FROM days d
     LEFT JOIN events_by_day e ON e.day = d.day
     LEFT JOIN outbound_by_day o ON o.day = d.day;

create or replace view public.analytics_position_daily as
SELECT (site_events.created_at AT TIME ZONE 'utc'::text)::date AS day,
    COALESCE(site_events.source_component, 'unknown'::text) AS source_component,
    COALESCE(site_events."position", 0) AS "position",
    count(*) FILTER (WHERE site_events.event_type = 'product_impression'::text) AS impressions,
    count(*) FILTER (WHERE site_events.event_type = 'product_click'::text) AS product_clicks,
    count(DISTINCT site_events.session_id) FILTER (WHERE site_events.event_type = 'product_impression'::text) AS impression_sessions,
    count(DISTINCT site_events.session_id) FILTER (WHERE site_events.event_type = 'product_click'::text) AS click_sessions
   FROM (SELECT * FROM public.site_events WHERE NOT excluded) site_events
  WHERE site_events.event_type = ANY (ARRAY['product_impression'::text, 'product_click'::text])
  GROUP BY ((site_events.created_at AT TIME ZONE 'utc'::text)::date), (COALESCE(site_events.source_component, 'unknown'::text)), (COALESCE(site_events."position", 0));

create or replace view public.analytics_search_daily as
WITH search_events AS (
         SELECT (site_events.created_at AT TIME ZONE 'utc'::text)::date AS day,
            lower(btrim(site_events.query)) AS query,
            count(*) AS searches,
            count(*) FILTER (WHERE COALESCE(site_events.results_count, 0) = 0) AS zero_result_searches,
            COALESCE(sum(site_events.results_count), 0::bigint) AS total_results
           FROM (SELECT * FROM public.site_events WHERE NOT excluded) site_events
          WHERE site_events.event_type = 'search'::text AND site_events.query IS NOT NULL AND btrim(site_events.query) <> ''::text
          GROUP BY ((site_events.created_at AT TIME ZONE 'utc'::text)::date), (lower(btrim(site_events.query)))
        ), search_clicks AS (
         SELECT (site_events.created_at AT TIME ZONE 'utc'::text)::date AS day,
            lower(btrim(site_events.query)) AS query,
            count(*) AS search_clicks
           FROM (SELECT * FROM public.site_events WHERE NOT excluded) site_events
          WHERE site_events.event_type = 'search_click'::text AND site_events.query IS NOT NULL AND btrim(site_events.query) <> ''::text
          GROUP BY ((site_events.created_at AT TIME ZONE 'utc'::text)::date), (lower(btrim(site_events.query)))
        ), search_outbound AS (
         SELECT (outbound_clicks.created_at AT TIME ZONE 'utc'::text)::date AS day,
            lower(btrim(outbound_clicks.search_query)) AS query,
            count(*) AS outbound_clicks,
            count(DISTINCT outbound_clicks.session_id) AS outbound_sessions
           FROM (SELECT * FROM public.outbound_clicks WHERE NOT excluded) outbound_clicks
          WHERE outbound_clicks.search_query IS NOT NULL AND btrim(outbound_clicks.search_query) <> ''::text
          GROUP BY ((outbound_clicks.created_at AT TIME ZONE 'utc'::text)::date), (lower(btrim(outbound_clicks.search_query)))
        )
 SELECT COALESCE(se.day, sc.day, so.day) AS day,
    COALESCE(se.query, sc.query, so.query) AS query,
    COALESCE(se.searches, 0::bigint) AS searches,
    COALESCE(se.zero_result_searches, 0::bigint) AS zero_result_searches,
    COALESCE(se.total_results, 0::bigint) AS total_results,
    COALESCE(sc.search_clicks, 0::bigint) AS search_clicks,
    COALESCE(so.outbound_clicks, 0::bigint) AS outbound_clicks,
    COALESCE(so.outbound_sessions, 0::bigint) AS outbound_sessions
   FROM search_events se
     FULL JOIN search_clicks sc ON sc.day = se.day AND sc.query = se.query
     FULL JOIN search_outbound so ON so.day = COALESCE(se.day, sc.day) AND so.query = COALESCE(se.query, sc.query);

create or replace view public.catalog_product_popularity as
WITH resolved_outbound AS (
         SELECT COALESCE(click.product_id, product_1.id) AS product_id,
            click.created_at
           FROM (SELECT * FROM public.outbound_clicks WHERE NOT excluded) click
             LEFT JOIN brands brand ON brand.slug = click.brand_slug
             LEFT JOIN products product_1 ON product_1.brand_id = brand.id AND click.product_slug = ((brand.slug || '--'::text) || product_1.handle)
        ), outbound AS (
         SELECT resolved_outbound.product_id,
            count(*) FILTER (WHERE resolved_outbound.created_at >= (now() - '30 days'::interval)) AS recent_outbound_clicks,
            count(*) AS lifetime_outbound_clicks
           FROM resolved_outbound
          WHERE resolved_outbound.product_id IS NOT NULL
          GROUP BY resolved_outbound.product_id
        ), events AS (
         SELECT site_events.product_id,
            count(*) FILTER (WHERE site_events.event_type = 'add_to_cart'::text AND site_events.created_at >= (now() - '30 days'::interval)) AS recent_add_to_carts,
            count(*) FILTER (WHERE site_events.event_type = 'add_to_cart'::text) AS lifetime_add_to_carts,
            count(*) FILTER (WHERE site_events.event_type = 'product_view'::text AND site_events.created_at >= (now() - '30 days'::interval)) AS recent_product_views,
            count(*) FILTER (WHERE site_events.event_type = 'product_view'::text) AS lifetime_product_views
           FROM (SELECT * FROM public.site_events WHERE NOT excluded) site_events
          WHERE site_events.product_id IS NOT NULL AND (site_events.event_type = ANY (ARRAY['add_to_cart'::text, 'product_view'::text]))
          GROUP BY site_events.product_id
        )
 SELECT product.id AS product_id,
    COALESCE(outbound.recent_outbound_clicks, 0::bigint) AS recent_outbound_clicks,
    COALESCE(outbound.lifetime_outbound_clicks, 0::bigint) AS lifetime_outbound_clicks,
    COALESCE(events.recent_add_to_carts, 0::bigint) AS recent_add_to_carts,
    COALESCE(events.lifetime_add_to_carts, 0::bigint) AS lifetime_add_to_carts,
    COALESCE(events.recent_product_views, 0::bigint) AS recent_product_views,
    COALESCE(events.lifetime_product_views, 0::bigint) AS lifetime_product_views,
    (12 * COALESCE(outbound.recent_outbound_clicks, 0::bigint) + 3 * GREATEST(COALESCE(outbound.lifetime_outbound_clicks, 0::bigint) - COALESCE(outbound.recent_outbound_clicks, 0::bigint), 0::bigint) + 8 * COALESCE(events.recent_add_to_carts, 0::bigint) + 2 * GREATEST(COALESCE(events.lifetime_add_to_carts, 0::bigint) - COALESCE(events.recent_add_to_carts, 0::bigint), 0::bigint) + 2 * COALESCE(events.recent_product_views, 0::bigint))::numeric + 0.5 * GREATEST(COALESCE(events.lifetime_product_views, 0::bigint) - COALESCE(events.recent_product_views, 0::bigint), 0::bigint)::numeric AS popularity_score
   FROM products product
     LEFT JOIN outbound ON outbound.product_id = product.id
     LEFT JOIN events ON events.product_id = product.id;

alter view public.analytics_daily_summary set (security_invoker=true); alter view public.analytics_search_daily set (security_invoker=true); alter view public.analytics_campaign_daily set (security_invoker=true); alter view public.analytics_brand_daily set (security_invoker=true); alter view public.analytics_position_daily set (security_invoker=true); alter view public.catalog_product_popularity set (security_invoker=true);
