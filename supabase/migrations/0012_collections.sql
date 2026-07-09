-- Hand-curated editorial collections (capsule/seasonal groupings an admin
-- assembles by hand), distinct from the data-driven homepage shelves
-- (category tiles, New In, Under $50) which are generated from filters.
-- A collection is a title/cover + an ordered list of specific products.

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text,
  cover_image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_products (
  collection_id uuid not null references public.collections(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  added_at timestamptz not null default now(),
  primary key (collection_id, product_id)
);

create index if not exists collection_products_collection_idx on public.collection_products (collection_id, sort_order);

alter table public.collections enable row level security;
alter table public.collection_products enable row level security;
