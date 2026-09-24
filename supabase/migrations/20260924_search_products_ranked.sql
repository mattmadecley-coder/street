BEGIN;

-- search_vector was auto-added as `text` by the migration's drift-column
-- detection (no type info available since it was never in the tracked
-- migrations) - drop and recreate properly as a real tsvector column.
ALTER TABLE products DROP COLUMN IF EXISTS search_vector;
ALTER TABLE products ADD COLUMN search_vector tsvector;

-- Recompute function shared by the backfill and the maintenance trigger.
CREATE OR REPLACE FUNCTION products_build_search_vector(
  p_title text, p_brand_name text, p_description text,
  p_category text, p_street_group text, p_street_category text,
  p_street_type text, p_street_detail text,
  p_tags text[], p_street_tags text[], p_colors text[], p_street_colors text[]
) RETURNS tsvector LANGUAGE sql IMMUTABLE AS $$
  SELECT
    setweight(to_tsvector('simple', coalesce(p_title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(p_brand_name, '')), 'A') ||
    setweight(to_tsvector('simple',
      coalesce(p_street_category, '') || ' ' || coalesce(p_street_type, '') || ' ' ||
      coalesce(p_street_group, '') || ' ' || coalesce(p_street_detail, '') || ' ' ||
      coalesce(p_category, '')), 'B') ||
    setweight(to_tsvector('simple',
      array_to_string(coalesce(p_tags, '{}'), ' ') || ' ' ||
      array_to_string(coalesce(p_street_tags, '{}'), ' ') || ' ' ||
      array_to_string(coalesce(p_colors, '{}'), ' ') || ' ' ||
      array_to_string(coalesce(p_street_colors, '{}'), ' ')), 'B') ||
    setweight(to_tsvector('simple', coalesce(p_description, '')), 'D');
$$;

CREATE OR REPLACE FUNCTION products_search_vector_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := products_build_search_vector(
    NEW.title, NEW.brand_name, NEW.description, NEW.category,
    NEW.street_group, NEW.street_category, NEW.street_type, NEW.street_detail,
    NEW.tags, NEW.street_tags, NEW.colors, NEW.street_colors
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_search_vector_update ON products;
CREATE TRIGGER products_search_vector_update
  BEFORE INSERT OR UPDATE OF title, brand_name, description, category,
    street_group, street_category, street_type, street_detail,
    tags, street_tags, colors, street_colors
  ON products
  FOR EACH ROW EXECUTE FUNCTION products_search_vector_trigger();

-- Backfill existing rows.
UPDATE products SET search_vector = products_build_search_vector(
  title, brand_name, description, category,
  street_group, street_category, street_type, street_detail,
  tags, street_tags, colors, street_colors
);

CREATE INDEX IF NOT EXISTS products_search_vector_gin_idx ON products USING gin(search_vector);

-- Ranked search RPC matching lib/catalog-page.ts's searchProductsRanked() call
-- (rpc/search_products_ranked, params p_tsquery/p_brand/p_group/p_category/
-- p_type/p_detail/p_color/p_size/p_in_stock_only/p_min/p_max/p_limit,
-- returns id/brand_slug/rank) and the same default row filters as
-- productPath() (is_active=true, is_hidden=false).
CREATE OR REPLACE FUNCTION search_products_ranked(
  p_tsquery text,
  p_brand text DEFAULT NULL,
  p_group text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_detail text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_size text DEFAULT NULL,
  p_in_stock_only boolean DEFAULT true,
  p_min numeric DEFAULT NULL,
  p_max numeric DEFAULT NULL,
  p_limit integer DEFAULT 1000
) RETURNS TABLE(id uuid, brand_slug text, rank real)
LANGUAGE sql STABLE AS $$
  SELECT p.id, b.slug AS brand_slug, ts_rank(p.search_vector, query) AS rank
  FROM products p
  JOIN brands b ON b.id = p.brand_id
  CROSS JOIN to_tsquery('simple', p_tsquery) AS query
  WHERE p.is_active = true
    AND p.is_hidden = false
    AND p.search_vector @@ query
    AND (p_brand IS NULL OR b.slug = p_brand)
    AND (p_group IS NULL OR p.street_group = p_group)
    AND (p_category IS NULL OR p.street_category = p_category)
    AND (p_type IS NULL OR p.street_type = p_type)
    AND (p_detail IS NULL OR p.street_detail = p_detail)
    AND (p_color IS NULL OR p.colors @> ARRAY[p_color])
    AND (p_size IS NULL OR p.sizes @> ARRAY[p_size])
    AND (p_in_stock_only = false OR p.stock_status = 'in_stock')
    AND (p_min IS NULL OR p.price >= p_min)
    AND (p_max IS NULL OR p.price <= p_max)
  ORDER BY rank DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION search_products_ranked TO anon, authenticated, service_role;

COMMIT;
