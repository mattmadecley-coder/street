alter table public.outbound_clicks
  add column if not exists product_title text,
  add column if not exists product_price numeric(12,2);

comment on column public.outbound_clicks.product_title is
  'Product title captured when purchase intent was recorded.';

comment on column public.outbound_clicks.product_price is
  'Listed product price captured when purchase intent was recorded; an intent-value proxy, not confirmed revenue.';

create index if not exists outbound_clicks_created_at_product_price_idx
  on public.outbound_clicks (created_at desc)
  where product_price is not null;
