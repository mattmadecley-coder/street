-- Street-owned taxonomy. Original brand category and tags remain in products.category and products.tags.
alter table public.products add column if not exists street_group text;
alter table public.products add column if not exists street_category text;
alter table public.products add column if not exists street_tags text[] not null default '{}';
alter table public.products add column if not exists street_colors text[] not null default '{}';
alter table public.products add column if not exists classification_status text not null default 'pending';
alter table public.products add column if not exists classification_confidence text;
alter table public.products add column if not exists classification_model text;
alter table public.products add column if not exists classification_version integer not null default 1;
alter table public.products add column if not exists classified_at timestamptz;
alter table public.products add column if not exists classification_error text;

alter table public.products drop constraint if exists products_classification_status_check;
alter table public.products add constraint products_classification_status_check
  check (classification_status in ('pending', 'classified', 'needs_review', 'error'));

create index if not exists products_classification_queue_idx
  on public.products (classification_status, is_active, created_at)
  where is_active = true;

create index if not exists products_street_group_category_idx
  on public.products (street_group, street_category)
  where is_active = true;

create index if not exists products_street_tags_gin_idx
  on public.products using gin (street_tags);

create index if not exists products_street_colors_gin_idx
  on public.products using gin (street_colors);

-- Existing products should be classified once. New imports automatically receive this default.
update public.products
set classification_status = 'pending',
    classification_version = 1,
    classification_error = null
where street_category is null;
