alter table public.brands
  add column if not exists storefront_status text not null default 'unknown'
    check (storefront_status in ('unknown','open','closed')),
  add column if not exists storefront_status_reason text,
  add column if not exists storefront_checked_at timestamptz;

create index if not exists brands_storefront_status_idx
  on public.brands (storefront_status);
