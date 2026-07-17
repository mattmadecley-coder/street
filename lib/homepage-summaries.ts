import { STREET_BRANDS } from "@/lib/brands";
import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";

export type HomepageBrandSummary = {
  slug: string;
  name: string;
  storeUrl: string;
  logoUrl: string | null;
  instagramUrl: string | null;
  productCount: number;
  featured: boolean;
  catalogEnabled: boolean;
  createdAt: string;
};

export type HomepageCategorySummary = {
  group: string;
  category: string;
  count: number;
  imageUrl: string | null;
};

type BrandSummaryRow = {
  slug: string;
  name: string;
  store_url: string;
  logo_url: string | null;
  instagram_url: string | null;
  product_count: number;
  is_featured: boolean;
  catalog_enabled: boolean | null;
  created_at: string;
};

type CategorySummaryRow = {
  group_name: string;
  category_name: string;
  product_count: number;
  image_url: string | null;
};

/**
 * Lightweight homepage brand data. Product totals are written during catalog
 * syncs, so this query reads one small row per brand instead of downloading
 * every active product and counting them during a visitor request.
 */
export async function getHomepageBrandSummaries(): Promise<HomepageBrandSummary[]> {
  const fallback: HomepageBrandSummary[] = STREET_BRANDS.map((brand) => ({
    slug: brand.slug,
    name: brand.name,
    storeUrl: brand.storeUrl,
    logoUrl: brand.logoUrl ?? null,
    instagramUrl: null,
    productCount: 0,
    featured: Boolean(brand.featured),
    catalogEnabled: brand.catalogEnabled ?? true,
    createdAt: new Date(0).toISOString(),
  }));

  if (!hasSupabaseCatalog()) return fallback;

  try {
    const rows = await supabaseRest<BrandSummaryRow[]>(
      "brands?select=slug,name,store_url,logo_url,instagram_url,product_count,is_featured,catalog_enabled,created_at&is_active=eq.true&order=name.asc"
    );
    return rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      storeUrl: row.store_url,
      logoUrl: row.logo_url,
      instagramUrl: row.instagram_url,
      productCount: Number(row.product_count ?? 0),
      featured: row.is_featured,
      catalogEnabled: row.catalog_enabled ?? true,
      createdAt: row.created_at,
    }));
  } catch (error) {
    console.error("Street homepage brand summary read failed", error);
    return fallback;
  }
}

/**
 * Reads the precomputed category totals and representative images maintained by
 * the catalog-sync trigger. This is a handful of rows rather than a full scan
 * of the products table.
 */
export async function getHomepageCategorySummaries(limit = 8): Promise<HomepageCategorySummary[]> {
  if (!hasSupabaseCatalog()) return [];

  try {
    const rows = await supabaseRest<CategorySummaryRow[]>(
      `catalog_category_summaries?select=group_name,category_name,product_count,image_url&order=product_count.desc&limit=${Math.max(1, Math.floor(limit))}`
    );
    return rows.map((row) => ({
      group: row.group_name,
      category: row.category_name,
      count: Number(row.product_count ?? 0),
      imageUrl: row.image_url,
    }));
  } catch (error) {
    console.error("Street homepage category summary read failed", error);
    return [];
  }
}
