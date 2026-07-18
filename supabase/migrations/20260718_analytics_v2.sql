alter table public.site_events
  add column if not exists event_id uuid default gen_random_uuid(),
  add column if not exists anonymous_user_id text,
  add column if not exists session_id text,
  add column if not exists event_sequence integer,
  add column if not exists source_component text,
  add column if not exists position integer,
  add column if not exists device_type text,
  add column if not exists browser text,
  add column if not exists operating_system text,
  add column if not exists screen_width integer,
  add column if not exists language text,
  add column if not exists timezone text,
  add column if not exists landing_path text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.outbound_clicks
  add column if not exists anonymous_user_id text,
  add column if not exists session_id text,
  add column if not exists source_component text,
  add column if not exists source_path text,
  add column if not exists search_query text,
  add column if not exists position integer,
  add column if not exists referrer text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists site_events_created_at_idx on public.site_events (created_at desc);
create index if not exists site_events_session_idx on public.site_events (session_id, created_at);
create index if not exists site_events_visitor_idx on public.site_events (anonymous_user_id, created_at);
create index if not exists site_events_type_created_idx on public.site_events (event_type, created_at desc);
create index if not exists site_events_product_created_idx on public.site_events (product_id, created_at desc) where product_id is not null;
create index if not exists site_events_brand_created_idx on public.site_events (brand_slug, created_at desc) where brand_slug is not null;
create index if not exists site_events_query_created_idx on public.site_events (lower(query), created_at desc) where query is not null;
create unique index if not exists site_events_event_id_uidx on public.site_events (event_id) where event_id is not null;
create index if not exists outbound_clicks_session_idx on public.outbound_clicks (session_id, created_at);
create index if not exists outbound_clicks_brand_created_idx on public.outbound_clicks (brand_slug, created_at desc);

alter table public.site_events enable row level security;
alter table public.outbound_clicks enable row level security;
