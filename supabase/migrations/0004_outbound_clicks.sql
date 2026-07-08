-- Tracks every shopper sent from Street to a brand's own site. This is how
-- Street will eventually prove to brands how much traffic it sends them
-- (see README "Next build priorities").
create table if not exists public.outbound_clicks (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  brand_slug text not null,
  product_slug text,
  destination_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists outbound_clicks_brand_idx on public.outbound_clicks (brand_slug, created_at desc);

alter table public.outbound_clicks enable row level security;
-- No select/insert policy for anon/authenticated: writes go through the
-- server-side service-role key only (see lib/outbound-clicks.ts), and reads
-- (e.g. a future brand-facing traffic report) will too.
