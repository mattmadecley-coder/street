-- The catalog sync's photo-backfill step (lib/catalog-store.ts) calls this
-- RPC to find which of a chunk of unchanged product ids already have rows
-- in product_images, so it only backfills the ones that don't. It was
-- created directly in the old cloud Supabase project and never captured in
-- a migration, so it never made it over in the self-hosted migration --
-- every sync's backfill step has been failing since with:
--   "Could not find the function public.products_with_images(p_ids) in the
--   schema cache"
-- Returns DISTINCT product_id (one row per product, not one per image) --
-- a raw product_images select was tried originally and got silently
-- truncated by PostgREST's row cap for image-dense brands, see the comment
-- in catalog-store.ts.
create or replace function public.products_with_images(p_ids uuid[])
returns table (product_id uuid)
language sql
stable
as $$
  select distinct product_id
  from public.product_images
  where product_id = any(p_ids);
$$;
