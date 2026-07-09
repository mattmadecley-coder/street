-- Lightweight analytics event log: search queries, search -> product clicks,
-- category browsing, and product views (captures price so the admin
-- dashboard can show what price ranges people actually look at). Outbound
-- brand clicks already have their own table (outbound_clicks); this is
-- everything else "what are people doing on Street" from the plan.
create table if not exists public.site_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('page_view','search','search_click','category_view','product_view')),
  query text,
  results_count integer,
  product_id uuid references public.products(id) on delete set null,
  brand_slug text,
  street_group text,
  street_category text,
  price numeric(12,2),
  path text,
  referrer text,
  created_at timestamptz not null default now()
);

create index if not exists site_events_type_created_idx on public.site_events (event_type, created_at desc);
create index if not exists site_events_search_query_idx on public.site_events (query) where event_type = 'search';
create index if not exists site_events_category_idx on public.site_events (street_group, street_category) where event_type in ('category_view','product_view');

alter table public.site_events enable row level security;
-- No select/insert policy for anon/authenticated: writes go through the
-- server-side service-role key only (see lib/analytics.ts), same pattern as
-- outbound_clicks. Admin analytics reads also go through the service role.
