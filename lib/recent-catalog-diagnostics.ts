import { hasSupabaseCatalog, supabaseRest, supabaseRestAll } from "@/lib/supabase-rest";

type SyncRunRow = {
  brand_id: string;
  started_at: string;
  completed_at: string | null;
  status: "running" | "success" | "failed";
  product_count: number | null;
  error_message: string | null;
  brands: { slug: string; name: string } | null;
};

type ProductCreatedRow = {
  brand_id: string;
  created_at: string;
};

export type BrandSyncDiagnostic = {
  brandSlug: string;
  brandName: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "success" | "failed";
  totalProducts: number;
  newProducts: number;
  existingProducts: number;
  durationMs: number | null;
  error: string | null;
};

export type RecentCatalogDiagnostics = {
  byBrand: Map<string, BrandSyncDiagnostic>;
  addedLast24Hours: number;
  brandsWithNewProducts: number;
  latestSyncAt: string | null;
};

const EMPTY: RecentCatalogDiagnostics = {
  byBrand: new Map(),
  addedLast24Hours: 0,
  brandsWithNewProducts: 0,
  latestSyncAt: null,
};

/**
 * Builds diagnostics without requiring new database columns. Product
 * `created_at` is permanent across upserts, so rows created between a sync's
 * start and completion are genuinely new; the remainder were existing rows
 * refreshed from the brand's latest feed.
 */
export async function getRecentCatalogDiagnostics(): Promise<RecentCatalogDiagnostics> {
  if (!hasSupabaseCatalog()) return EMPTY;

  try {
    const [runs, products] = await Promise.all([
      supabaseRest<SyncRunRow[]>(
        "catalog_sync_runs?select=brand_id,started_at,completed_at,status,product_count,error_message,brands(slug,name)&order=started_at.desc&limit=300",
        { noStore: true },
      ),
      supabaseRestAll<ProductCreatedRow[]>(
        "products?select=brand_id,created_at&is_active=eq.true&order=created_at.desc",
      ),
    ]);

    const productTimesByBrand = new Map<string, number[]>();
    for (const product of products) {
      const createdAt = new Date(product.created_at).getTime();
      if (!Number.isFinite(createdAt)) continue;
      const times = productTimesByBrand.get(product.brand_id) ?? [];
      times.push(createdAt);
      productTimesByBrand.set(product.brand_id, times);
    }

    const byBrand = new Map<string, BrandSyncDiagnostic>();
    for (const run of runs) {
      const slug = run.brands?.slug;
      if (!slug || byBrand.has(slug)) continue;

      const startedAt = new Date(run.started_at).getTime();
      const completedAt = run.completed_at ? new Date(run.completed_at).getTime() : null;
      const upperBound = completedAt && Number.isFinite(completedAt) ? completedAt + 5 * 60_000 : Date.now();
      const newProducts = Number.isFinite(startedAt)
        ? (productTimesByBrand.get(run.brand_id) ?? []).filter((createdAt) => createdAt >= startedAt && createdAt <= upperBound).length
        : 0;
      const totalProducts = Number(run.product_count ?? 0);

      byBrand.set(slug, {
        brandSlug: slug,
        brandName: run.brands?.name ?? slug,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        status: run.status,
        totalProducts,
        newProducts,
        existingProducts: Math.max(0, totalProducts - newProducts),
        durationMs: completedAt && Number.isFinite(startedAt) && Number.isFinite(completedAt) ? Math.max(0, completedAt - startedAt) : null,
        error: run.error_message,
      });
    }

    const cutoff = Date.now() - 24 * 60 * 60_000;
    const recentlyAdded = products.filter((product) => {
      const createdAt = new Date(product.created_at).getTime();
      return Number.isFinite(createdAt) && createdAt >= cutoff;
    });

    return {
      byBrand,
      addedLast24Hours: recentlyAdded.length,
      brandsWithNewProducts: new Set(recentlyAdded.map((product) => product.brand_id)).size,
      latestSyncAt: runs[0]?.completed_at ?? runs[0]?.started_at ?? null,
    };
  } catch (error) {
    console.error("Street recent catalog diagnostics read failed", error);
    return EMPTY;
  }
}
