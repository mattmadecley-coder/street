-- Admin-only visibility override, separate from is_active. is_active tracks
-- whether the brand's source still lists the product (flipped automatically
-- by every catalog sync); is_hidden is a manual admin choice to pull a
-- product off the site regardless of source availability, and survives
-- re-syncs since syncSingleBrand never touches it.
alter table public.products add column if not exists is_hidden boolean not null default false;
create index if not exists products_hidden_idx on public.products (is_hidden);
