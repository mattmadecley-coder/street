-- Street does not process checkout, so this view ranks real purchase intent
-- rather than inventing sales. Recent activity (last 30 days) is weighted more
-- heavily, while older lifetime activity supplies stable support:
--   12 x recent outbound click + 3 x older outbound click
--    8 x recent add-to-cart  + 2 x older add-to-cart
--    2 x recent product view + 0.5 x older product view
-- Product-card impressions intentionally carry no weight.

create index if not exists outbound_clicks_product_slug_created_idx
  on public.outbound_clicks (product_slug, created_at desc)
  where product_slug is not null;

create or replace view public.catalog_product_popularity
with (security_invoker = true)
as
with resolved_outbound as (
  select
    coalesce(click.product_id, product.id) as product_id,
    click.created_at
  from public.outbound_clicks as click
  left join public.brands as brand
    on brand.slug = click.brand_slug
  left join public.products as product
    on product.brand_id = brand.id
   and click.product_slug = brand.slug || '--' || product.handle
),
outbound as (
  select
    product_id,
    count(*) filter (where created_at >= now() - interval '30 days')::bigint as recent_outbound_clicks,
    count(*)::bigint as lifetime_outbound_clicks
  from resolved_outbound
  where product_id is not null
  group by product_id
),
events as (
  select
    product_id,
    count(*) filter (where event_type = 'add_to_cart' and created_at >= now() - interval '30 days')::bigint as recent_add_to_carts,
    count(*) filter (where event_type = 'add_to_cart')::bigint as lifetime_add_to_carts,
    count(*) filter (where event_type = 'product_view' and created_at >= now() - interval '30 days')::bigint as recent_product_views,
    count(*) filter (where event_type = 'product_view')::bigint as lifetime_product_views
  from public.site_events
  where product_id is not null
    and event_type in ('add_to_cart', 'product_view')
  group by product_id
)
select
  product.id as product_id,
  coalesce(outbound.recent_outbound_clicks, 0) as recent_outbound_clicks,
  coalesce(outbound.lifetime_outbound_clicks, 0) as lifetime_outbound_clicks,
  coalesce(events.recent_add_to_carts, 0) as recent_add_to_carts,
  coalesce(events.lifetime_add_to_carts, 0) as lifetime_add_to_carts,
  coalesce(events.recent_product_views, 0) as recent_product_views,
  coalesce(events.lifetime_product_views, 0) as lifetime_product_views,
  (
    12 * coalesce(outbound.recent_outbound_clicks, 0)
    + 3 * greatest(coalesce(outbound.lifetime_outbound_clicks, 0) - coalesce(outbound.recent_outbound_clicks, 0), 0)
    + 8 * coalesce(events.recent_add_to_carts, 0)
    + 2 * greatest(coalesce(events.lifetime_add_to_carts, 0) - coalesce(events.recent_add_to_carts, 0), 0)
    + 2 * coalesce(events.recent_product_views, 0)
    + 0.5 * greatest(coalesce(events.lifetime_product_views, 0) - coalesce(events.recent_product_views, 0), 0)
  )::numeric as popularity_score
from public.products as product
left join outbound on outbound.product_id = product.id
left join events on events.product_id = product.id;

comment on view public.catalog_product_popularity is
  'Stable purchase-intent score: recent/older outbound clicks 12/3, add-to-cart 8/2, and product views 2/0.5; product impressions excluded.';

revoke all on table public.catalog_product_popularity from public, anon, authenticated;
grant select on table public.catalog_product_popularity to service_role;
