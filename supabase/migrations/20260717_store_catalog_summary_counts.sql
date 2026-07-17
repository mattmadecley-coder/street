alter table public.brands
  add column if not exists product_count integer not null default 0;

create table if not exists public.catalog_category_summaries (
  group_name text not null,
  category_name text not null,
  product_count integer not null default 0,
  image_url text,
  updated_at timestamptz not null default now(),
  primary key (group_name, category_name)
);

alter table public.catalog_category_summaries enable row level security;

create or replace function public.refresh_brand_product_count(target_brand_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.brands b
  set product_count = (
    select count(*)::integer
    from public.products p
    where p.brand_id = target_brand_id
      and p.is_active = true
      and p.is_hidden = false
  ),
  updated_at = now()
  where b.id = target_brand_id;
$$;

create or replace function public.refresh_catalog_category_summaries()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate table public.catalog_category_summaries;

  insert into public.catalog_category_summaries (
    group_name,
    category_name,
    product_count,
    image_url,
    updated_at
  )
  select
    p.street_group,
    p.street_category,
    count(*)::integer,
    (array_agg(p.primary_image_url order by p.last_synced_at desc nulls last)
      filter (where p.primary_image_url is not null))[1],
    now()
  from public.products p
  where p.is_active = true
    and p.is_hidden = false
    and p.street_group is not null
    and p.street_category is not null
    and p.street_category <> ''
  group by p.street_group, p.street_category;
end;
$$;

grant execute on function public.refresh_brand_product_count(uuid) to service_role;
grant execute on function public.refresh_catalog_category_summaries() to service_role;

update public.brands b
set product_count = counts.product_count,
    updated_at = now()
from (
  select brand_id, count(*)::integer as product_count
  from public.products
  where is_active = true and is_hidden = false
  group by brand_id
) counts
where b.id = counts.brand_id;

update public.brands b
set product_count = 0,
    updated_at = now()
where not exists (
  select 1
  from public.products p
  where p.brand_id = b.id
    and p.is_active = true
    and p.is_hidden = false
);

select public.refresh_catalog_category_summaries();
