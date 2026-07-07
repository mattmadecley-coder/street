create extension if not exists pgcrypto;

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  store_url text not null,
  logo_url text,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  external_id text not null,
  handle text not null,
  title text not null,
  description text not null default '',
  source_url text not null,
  price numeric(12,2) not null,
  compare_at_price numeric(12,2),
  stock_status text not null check (stock_status in ('in_stock', 'sold_out')),
  is_preorder boolean not null default false,
  category text not null default 'Other',
  tags text[] not null default '{}',
  primary_image_url text,
  is_active boolean not null default true,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, external_id),
  unique (brand_id, handle)
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  source_url text not null,
  sort_order integer not null default 0,
  alt_text text,
  unique (product_id, sort_order)
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  external_id text not null,
  title text,
  price numeric(12,2) not null,
  compare_at_price numeric(12,2),
  available boolean not null default false,
  option1 text,
  option2 text,
  option3 text,
  unique (product_id, external_id)
);

create table if not exists public.catalog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('running', 'success', 'failed')),
  product_count integer not null default 0,
  error_message text
);

create index if not exists products_brand_active_idx on public.products (brand_id, is_active);
create index if not exists products_category_idx on public.products (category);
create index if not exists products_price_idx on public.products (price);
create index if not exists product_images_product_idx on public.product_images (product_id, sort_order);
create index if not exists product_variants_product_idx on public.product_variants (product_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists brands_set_updated_at on public.brands;
create trigger brands_set_updated_at before update on public.brands
for each row execute function public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();

alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.catalog_sync_runs enable row level security;

create policy "public can read active brands" on public.brands for select using (is_active = true);
create policy "public can read active products" on public.products for select using (is_active = true);
create policy "public can read product images" on public.product_images for select using (true);
create policy "public can read product variants" on public.product_variants for select using (true);
