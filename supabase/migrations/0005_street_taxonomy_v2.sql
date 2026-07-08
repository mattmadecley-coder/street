-- Extends the Street taxonomy from 2 levels (street_group, street_category)
-- to 4 (+ street_type, street_detail), plus a footwear-only "activity" facet
-- (Running, Basketball, etc), matching the rebuilt lib/street-taxonomy.ts
-- which mirrors GOAT's real category tree.
alter table public.products add column if not exists street_type text;
alter table public.products add column if not exists street_detail text;
alter table public.products add column if not exists street_activity text;

create index if not exists products_street_type_idx
  on public.products (street_group, street_category, street_type)
  where is_active = true;

-- Re-classify everything under the old 2-level taxonomy: type/detail/activity
-- were never populated for existing rows, and old street_group/street_category
-- values (Apparel/Bottoms/Outerwear/Footwear/Accessories/Lifestyle) don't
-- match the new GOAT-mirrored group names in most cases.
update public.products
set classification_status = 'pending',
    street_group = null,
    street_category = null,
    street_type = null,
    street_detail = null,
    street_activity = null,
    classification_version = 2,
    classification_error = null;
