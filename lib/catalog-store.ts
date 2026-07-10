import { STREET_BRANDS, type StreetBrand } from "@/lib/brands";
import { STREET_TAXONOMY, categoriesForGroup } from "@/lib/street-taxonomy";
import { fetchBrandMetadata, type BrandMetadata } from "@/lib/brand-metadata";
import { classifyProductWithAI } from "@/lib/ai-product-classifier";
import { importBrandCatalog, type ImportedProduct } from "@/lib/source-import";
import { hasSupabaseCatalog, supabaseRest, supabaseRestAll } from "@/lib/supabase-rest";
import type { StreetProduct } from "@/lib/catalog";

type BrandRow = { id: string; slug: string; name: string; store_url: string; logo_url: string | null; instagram_url: string | null; metadata_synced_at: string | null; is_active: boolean; is_featured: boolean; catalog_enabled?: boolean };
type ImageRow = { source_url: string; sort_order: number; alt_text?: string | null };
type VariantRow = { external_id: string; title: string | null; price: string | number; compare_at_price: string | number | null; available: boolean; option1: string | null; option2: string | null; option3: string | null; image_url: string | null };
type ProductRow = { id: string; brand_id: string; external_id: string; handle: string; title: string; description: string; source_url: string; price: string | number; compare_at_price: string | number | null; stock_status: "in_stock" | "sold_out"; is_preorder: boolean; category: string; tags: string[]; colors: string[]; sizes: string[]; primary_image_url: string | null; last_synced_at: string; is_active: boolean; brands: BrandRow | null; product_images: ImageRow[] | null; product_variants: VariantRow[] | null; street_group: string | null; street_category: string | null; street_type: string | null; street_detail: string | null };
type PendingClassificationRow = { id: string; title: string; description: string; category: string; tags: string[]; colors: string[] };
type ProductCountRow = { brand_id: string };
type SyncRunRow = { id: string };
type SyncRunHistoryRow = { brand_id: string; started_at: string; completed_at: string | null; status: "running" | "success" | "failed"; product_count: number; error_message: string | null; brands: { slug: string } | null };

export type StreetBrandProfile = { slug: string; name: string; storeUrl: string; logoUrl: string | null; instagramUrl: string | null; productCount: number; featured: boolean; catalogEnabled: boolean; createdAt: string };
export type CatalogSyncResult = { brand: string; productCount: number; ok: boolean; error?: string };
export type ClassificationRunResult = { id: string; title: string; status: "classified" | "needs_review" | "error"; group?: string; category?: string; tags?: string[]; error?: string };
export type BrandSyncStatus = { lastSyncedAt: string | null; lastStatus: "running" | "success" | "failed" | null; lastProductCount: number | null; lastError: string | null };

// The classifier is text-only now (see lib/ai-product-classifier.ts) — no
// images to fetch/send, so each call is fast and this can run a much bigger
// batch per invocation and still comfortably fit inside a route's 60s
// function timeout.
const CLASSIFICATION_BATCH_MAX = 25;
// How many brands to sync concurrently in one cron run. Every enabled brand
// is attempted every run (see syncStreetCatalog) — concurrency is what makes
// that fit inside the 60s function timeout instead of a multi-day rotation.
const CATALOG_SYNC_CONCURRENCY = 6;
const number = (value: string | number | null | undefined) => Number(value ?? 0);

function toVariantSummary(row: VariantRow) {
  return { externalId: row.external_id, title: row.title ?? "", price: number(row.price), compareAtPrice: row.compare_at_price === null ? undefined : number(row.compare_at_price), available: row.available, option1: row.option1 ?? undefined, option2: row.option2 ?? undefined, option3: row.option3 ?? undefined, imageUrl: row.image_url ?? undefined };
}

function toStreetProduct(row: ProductRow): StreetProduct {
  const brand = row.brands;
  const images = [...(row.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((image) => image.source_url);
  const variants = row.product_variants ?? [];
  return { id: row.id, slug: `${brand?.slug ?? "brand"}--${row.handle}`, handle: row.handle, brandSlug: brand?.slug ?? "brand", brandName: brand?.name ?? "Unknown brand", description: row.description, sourceUrl: row.source_url, title: row.title, price: number(row.price), compareAtPrice: row.compare_at_price === null ? undefined : number(row.compare_at_price), stockStatus: row.stock_status, isPreorder: row.is_preorder, primaryImage: row.primary_image_url ?? images[0] ?? "", images, colors: row.colors ?? [], sizes: row.sizes ?? [], category: row.category, tags: row.tags ?? [], lastSyncedAt: row.last_synced_at, streetGroup: row.street_group ?? undefined, streetCategory: row.street_category ?? undefined, streetType: row.street_type ?? undefined, streetDetail: row.street_detail ?? undefined, variantCount: variants.length, variants: variants.map(toVariantSummary) };
}

function toStreetBrand(row: BrandRow): StreetBrand {
  return { slug: row.slug, name: row.name, storeUrl: row.store_url, logoUrl: row.logo_url ?? undefined, featured: row.is_featured, catalogEnabled: row.catalog_enabled ?? true };
}

export async function getStoredCatalog(): Promise<StreetProduct[] | null> {
  if (!hasSupabaseCatalog()) return null;
  try {
    const rows = await supabaseRestAll<ProductRow[]>("products?select=*,brands(*),product_images(*),product_variants(*)&is_active=eq.true&is_hidden=eq.false&order=updated_at.desc,id.desc");
    return rows.map(toStreetProduct);
  } catch (error) {
    console.error("Street database catalog read failed", error);
    return null;
  }
}

/**
 * Every brand Street knows about — DB rows (including brands added through
 * /admin/brands/new) layered over the static STREET_BRANDS seed list. The
 * DB is the source of truth once Supabase is configured; the static array
 * only matters as a fallback (local dev without Supabase, or first boot).
 */
export async function getAllBrands(): Promise<StreetBrand[]> {
  const fallback = new Map<string, StreetBrand>(STREET_BRANDS.map((brand) => [brand.slug, brand]));
  if (!hasSupabaseCatalog()) return [...fallback.values()];
  try {
    const rows = await supabaseRest<BrandRow[]>("brands?select=slug,name,store_url,logo_url,is_active,is_featured,catalog_enabled&is_active=eq.true&order=name.asc");
    for (const row of rows) fallback.set(row.slug, toStreetBrand(row));
    return [...fallback.values()];
  } catch (error) {
    console.error("Street brand list read failed", error);
    return [...fallback.values()];
  }
}

export async function getBrandBySlug(slug: string): Promise<StreetBrand | null> {
  if (hasSupabaseCatalog()) {
    try {
      const rows = await supabaseRest<BrandRow[]>(`brands?select=slug,name,store_url,logo_url,is_active,is_featured,catalog_enabled&slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&limit=1`, { noStore: true });
      if (rows[0]) return toStreetBrand(rows[0]);
    } catch (error) {
      console.error("Street brand lookup failed", error);
    }
  }
  return STREET_BRANDS.find((brand) => brand.slug === slug) ?? null;
}

/** Normalized root domain (no protocol, no "www.") for duplicate-brand detection. */
export function rootDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Finds an existing brand whose store URL shares the same root domain, regardless of slug/name. Used to block adding a brand that's already onboarded. */
export async function findBrandByDomain(url: string): Promise<StreetBrand | null> {
  const domain = rootDomain(url);
  if (!domain) return null;
  const brands = await getAllBrands();
  return brands.find((brand) => rootDomain(brand.storeUrl) === domain) ?? null;
}

export async function getBrandDirectory(): Promise<StreetBrandProfile[]> {
  const brands = await getAllBrands();
  const fallback = new Map<string, StreetBrandProfile>(brands.map((brand) => [brand.slug, { slug: brand.slug, name: brand.name, storeUrl: brand.storeUrl, logoUrl: brand.logoUrl ?? null, instagramUrl: null, productCount: 0, featured: Boolean(brand.featured), catalogEnabled: brand.catalogEnabled ?? true, createdAt: new Date(0).toISOString() }]));
  if (!hasSupabaseCatalog()) return [...fallback.values()].sort((a, b) => a.name.localeCompare(b.name));
  try {
    const [rows, products] = await Promise.all([
      supabaseRest<(BrandRow & { created_at: string })[]>("brands?select=*&is_active=eq.true&order=name.asc"),
      supabaseRestAll<ProductCountRow[]>("products?select=brand_id&is_active=eq.true&order=id.asc"),
    ]);
    const counts = products.reduce((map, product) => map.set(product.brand_id, (map.get(product.brand_id) ?? 0) + 1), new Map<string, number>());
    for (const row of rows) fallback.set(row.slug, { slug: row.slug, name: row.name, storeUrl: row.store_url, logoUrl: row.logo_url, instagramUrl: row.instagram_url, productCount: counts.get(row.id) ?? 0, featured: row.is_featured, catalogEnabled: row.catalog_enabled ?? true, createdAt: row.created_at });
    return [...fallback.values()].sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error("Street brand directory read failed", error);
    return [...fallback.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

/**
 * Pending-classification count per brand slug (products.classification_status
 * = 'pending', still active). Powers the "Classifying products (x of y)"
 * progress state on /admin/brands — combined with productCount from
 * getBrandDirectory, x = productCount - pending.
 */
export async function getBrandClassificationProgress(): Promise<Map<string, number>> {
  if (!hasSupabaseCatalog()) return new Map();
  try {
    const rows = await supabaseRestAll<Array<{ brand_id: string; brands: { slug: string } | null }>>(
      "products?select=brand_id,brands(slug)&is_active=eq.true&classification_status=eq.pending&order=id.asc"
    );
    const map = new Map<string, number>();
    for (const row of rows) {
      const slug = row.brands?.slug;
      if (!slug) continue;
      map.set(slug, (map.get(slug) ?? 0) + 1);
    }
    return map;
  } catch (error) {
    console.error("Street brand classification progress read failed", error);
    return new Map();
  }
}

export type CategorySummary = { group: string; categories: string[] };

/**
 * Which taxonomy groups/categories currently have at least one live,
 * classified product — powers the header's "Categories" mega-menu so it
 * never links somewhere empty. Cached the same way as the rest of the
 * catalog (see supabaseRestAll / CATALOG_CACHE_TAG), so this doesn't add a
 * real extra round trip on top of normal page loads.
 */
export async function getActiveCategorySummary(): Promise<CategorySummary[]> {
  if (!hasSupabaseCatalog()) return [];
  try {
    const rows = await supabaseRestAll<Array<{ street_group: string | null; street_category: string | null }>>(
      "products?select=street_group,street_category&is_active=eq.true&is_hidden=eq.false&street_group=not.is.null&street_category=not.is.null&order=id.asc"
    );
    const byGroup = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row.street_group || !row.street_category) continue;
      if (!byGroup.has(row.street_group)) byGroup.set(row.street_group, new Set());
      byGroup.get(row.street_group)!.add(row.street_category);
    }
    // Taxonomy order (Footwear, Apparel, Accessories, ...), not row order.
    return Object.keys(STREET_TAXONOMY)
      .filter((group) => byGroup.has(group))
      .map((group) => ({ group, categories: categoriesForGroup(group).filter((category) => byGroup.get(group)!.has(category)) }));
  } catch (error) {
    console.error("Street category summary read failed", error);
    return [];
  }
}

export type CategoryShowcaseItem = { group: string; category: string; count: number; imageUrl: string | null };

/**
 * Top categories by live product count, each with a representative image
 * (the most recently synced product's photo in that category) - powers the
 * homepage's "Shop by category" tiles. Same client-side-aggregate approach
 * as getActiveCategorySummary above (PostgREST has no GROUP BY endpoint),
 * just also tracking a count and a photo per bucket instead of only which
 * categories exist.
 */
export async function getHomepageCategoryShowcase(limit = 8): Promise<CategoryShowcaseItem[]> {
  if (!hasSupabaseCatalog()) return [];
  try {
    const rows = await supabaseRestAll<Array<{ street_group: string | null; street_category: string | null; primary_image_url: string | null }>>(
      "products?select=street_group,street_category,primary_image_url&is_active=eq.true&is_hidden=eq.false&street_group=not.is.null&street_category=not.is.null&street_category=neq.&order=last_synced_at.desc"
    );
    const byKey = new Map<string, CategoryShowcaseItem>();
    for (const row of rows) {
      if (!row.street_group || !row.street_category) continue;
      const key = `${row.street_group}::${row.street_category}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
        // Rows are newest-first, so whichever row we saw first for this key
        // already has the newest photo - don't overwrite it with an older one.
      } else {
        byKey.set(key, { group: row.street_group, category: row.street_category, count: 1, imageUrl: row.primary_image_url });
      }
    }
    return [...byKey.values()].sort((a, b) => b.count - a.count).slice(0, limit);
  } catch (error) {
    console.error("Street category showcase read failed", error);
    return [];
  }
}

/** Most recent catalog_sync_runs row per brand, keyed by brand slug — powers the "last updated" column in /admin/brands. */
export async function getBrandSyncStatuses(): Promise<Map<string, BrandSyncStatus>> {
  if (!hasSupabaseCatalog()) return new Map();
  try {
    const rows = await supabaseRest<SyncRunHistoryRow[]>("catalog_sync_runs?select=brand_id,started_at,completed_at,status,product_count,error_message,brands(slug)&order=started_at.desc&limit=300");
    const map = new Map<string, BrandSyncStatus>();
    for (const row of rows) {
      const slug = row.brands?.slug;
      if (!slug || map.has(slug)) continue; // rows are newest-first, so the first hit per slug is the latest run
      map.set(slug, { lastSyncedAt: row.completed_at ?? row.started_at, lastStatus: row.status, lastProductCount: row.product_count, lastError: row.error_message });
    }
    return map;
  } catch (error) {
    console.error("Street brand sync status read failed", error);
    return new Map();
  }
}

async function getExistingBrand(slug: string) {
  // noStore: this feeds an upsert decision, so it must never read a stale cached row.
  const rows = await supabaseRest<BrandRow[]>(`brands?select=*&slug=eq.${encodeURIComponent(slug)}`, { noStore: true });
  return rows[0] ?? null;
}

async function upsertBrand(brand: StreetBrand, metadata?: BrandMetadata) {
  const existing = await getExistingBrand(brand.slug);
  const rows = await supabaseRest<BrandRow[]>("brands?on_conflict=slug", {
    method: "POST",
    body: {
      slug: brand.slug,
      name: brand.name,
      store_url: brand.storeUrl,
      logo_url: metadata?.logoUrl ?? brand.logoUrl ?? existing?.logo_url ?? null,
      instagram_url: metadata?.instagramUrl ?? existing?.instagram_url ?? null,
      metadata_synced_at: metadata ? new Date().toISOString() : existing?.metadata_synced_at ?? null,
      is_active: true,
      is_featured: Boolean(brand.featured),
      catalog_enabled: brand.catalogEnabled ?? existing?.catalog_enabled ?? true,
    },
    prefer: "resolution=merge-duplicates,return=representation",
  });
  if (!rows[0]) throw new Error(`Could not save ${brand.name}.`);
  return rows[0];
}

/**
 * Creates (or updates) a brand row from just a slug/name/store URL — the
 * admin "add new brand" wizard's step 1. New brands start with
 * catalog_enabled=false so they don't get swept into the next automatic
 * daily sync before their logo is set and their first import has actually
 * been reviewed; the wizard flips it on once the admin runs the import step.
 */
export async function createBrandDraft(input: { slug: string; name: string; storeUrl: string }): Promise<StreetBrand> {
  if (!hasSupabaseCatalog()) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const row = await upsertBrand({ slug: input.slug, name: input.name, storeUrl: input.storeUrl, catalogEnabled: false });
  return toStreetBrand(row);
}

export async function setBrandCatalogEnabled(slug: string, enabled: boolean) {
  if (!hasSupabaseCatalog()) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  await supabaseRest(`brands?slug=eq.${encodeURIComponent(slug)}`, { method: "PATCH", body: { catalog_enabled: enabled }, prefer: "return=minimal" });
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, callback: (item: T) => Promise<R>) {
  const results: R[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await callback(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function syncBrandDirectory() {
  if (!hasSupabaseCatalog()) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const brands = await getAllBrands();
  return mapWithConcurrency(brands, 5, async (brand) => {
    try {
      const metadata = await fetchBrandMetadata(brand);
      await upsertBrand(brand, metadata);
      return { brand: brand.slug, logoFound: Boolean(metadata.logoUrl), instagramFound: Boolean(metadata.instagramUrl), ok: true as const };
    } catch (error) {
      return { brand: brand.slug, logoFound: false, instagramFound: false, ok: false as const, error: error instanceof Error ? error.message : "Metadata sync failed" };
    }
  });
}

function databaseProduct(brandId: string, product: ImportedProduct) {
  return { brand_id: brandId, external_id: product.externalId, handle: product.handle, title: product.title, description: product.description, source_url: product.sourceUrl, price: product.price, compare_at_price: product.compareAtPrice ?? null, stock_status: product.stockStatus, is_preorder: product.isPreorder, category: product.category, tags: product.tags, colors: product.colors, sizes: product.sizes, primary_image_url: product.images[0] ?? null, is_active: true, last_synced_at: new Date().toISOString() };
}

/**
 * Imports (or re-imports) one brand's full catalog: fetches the source feed,
 * marks everything previously on file for this brand inactive, then
 * upserts the fresh product/image/variant rows. Re-running this for a brand
 * that's already in the database is exactly how "did anything sell out /
 * come back in stock / get added" is detected — stock_status, sizes
 * (product_variants), and the product list itself are fully replaced with
 * whatever the brand's source currently says. Used by both the daily cron
 * (syncStreetCatalog, all enabled brands) and the admin "sync now" /
 * new-brand-wizard import step (this brand only).
 */
export async function syncSingleBrand(brand: StreetBrand): Promise<CatalogSyncResult> {
  const brandRow = await upsertBrand(brand);
  const runRows = await supabaseRest<SyncRunRow[]>("catalog_sync_runs", { method: "POST", body: { brand_id: brandRow.id, status: "running" } });
  const runId = runRows[0]?.id;
  try {
    const imported = await importBrandCatalog(brand);
    if (!imported.length) throw new Error("The brand source did not return any products.");
    await supabaseRest(`products?brand_id=eq.${brandRow.id}`, { method: "PATCH", body: { is_active: false }, prefer: "return=minimal" });
    const saved = await supabaseRest<Array<{ id: string; external_id: string }>>("products?on_conflict=brand_id,external_id", { method: "POST", body: imported.map((product) => databaseProduct(brandRow.id, product)), prefer: "resolution=merge-duplicates,return=representation" });
    const ids = new Map(saved.map((product) => [product.external_id, product.id]));
    await Promise.all(saved.flatMap((product) => [supabaseRest(`product_images?product_id=eq.${product.id}`, { method: "DELETE", prefer: "return=minimal" }), supabaseRest(`product_variants?product_id=eq.${product.id}`, { method: "DELETE", prefer: "return=minimal" })]));
    const images = imported.flatMap((product) => { const productId = ids.get(product.externalId); return productId ? product.images.map((sourceUrl, sortOrder) => ({ product_id: productId, source_url: sourceUrl, sort_order: sortOrder, alt_text: product.title })) : []; });
    const variants = imported.flatMap((product) => { const productId = ids.get(product.externalId); return productId ? product.variants.map((variant) => ({ product_id: productId, external_id: variant.externalId, title: variant.title || null, price: variant.price, compare_at_price: variant.compareAtPrice ?? null, available: variant.available, option1: variant.option1 ?? null, option2: variant.option2 ?? null, option3: variant.option3 ?? null, image_url: variant.imageUrl ?? null })) : []; });
    if (images.length) await supabaseRest("product_images", { method: "POST", body: images, prefer: "return=minimal" });
    if (variants.length) await supabaseRest("product_variants", { method: "POST", body: variants, prefer: "return=minimal" });
    if (runId) await supabaseRest(`catalog_sync_runs?id=eq.${runId}`, { method: "PATCH", body: { status: "success", completed_at: new Date().toISOString(), product_count: imported.length }, prefer: "return=minimal" });
    return { brand: brand.slug, productCount: imported.length, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    if (runId) await supabaseRest(`catalog_sync_runs?id=eq.${runId}`, { method: "PATCH", body: { status: "failed", completed_at: new Date().toISOString(), error_message: message }, prefer: "return=minimal" }).catch(() => undefined);
    return { brand: brand.slug, productCount: 0, ok: false, error: message };
  }
}

export async function classifyPendingProducts(requestedLimit?: number, brandSlug?: string) {
  if (!hasSupabaseCatalog()) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const limit = Math.max(1, Math.min(CLASSIFICATION_BATCH_MAX, Math.floor(requestedLimit ?? 1)));
  const params = new URLSearchParams();
  params.set("select", brandSlug ? "id,title,description,category,tags,colors,brands!inner(slug)" : "id,title,description,category,tags,colors");
  params.set("classification_status", "eq.pending");
  params.set("is_active", "eq.true");
  params.set("order", "created_at.asc");
  params.set("limit", String(limit));
  if (brandSlug) params.set("brands.slug", `eq.${brandSlug}`);

  // noStore: this drives which rows get patched next, so it must reflect the latest status.
  const pending = await supabaseRest<PendingClassificationRow[]>(`products?${params.toString()}`, { noStore: true });
  const results: ClassificationRunResult[] = [];

  for (const product of pending) {
    try {
      const { classification, model } = await classifyProductWithAI({
        title: product.title,
        description: product.description,
        sourceCategory: product.category,
        sourceTags: product.tags ?? [],
        sourceColors: product.colors ?? [],
      });
      const status = classification.confidence === "low" ? "needs_review" : "classified";
      await supabaseRest(`products?id=eq.${product.id}`, {
        method: "PATCH",
        body: {
          street_group: classification.group,
          street_category: classification.category,
          street_type: classification.type,
          street_detail: classification.detail,
          street_activity: classification.activity,
          street_tags: classification.tags,
          street_colors: classification.colors,
          classification_status: status,
          classification_confidence: classification.confidence,
          classification_model: model,
          classification_version: 2,
          classified_at: new Date().toISOString(),
          classification_error: null,
        },
        prefer: "return=minimal",
      });
      results.push({ id: product.id, title: product.title, status, group: classification.group, category: classification.category, tags: classification.tags });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI classification failed";
      await supabaseRest(`products?id=eq.${product.id}`, {
        method: "PATCH",
        body: { classification_status: "error", classification_error: message },
        prefer: "return=minimal",
      }).catch(() => undefined);
      results.push({ id: product.id, title: product.title, status: "error", error: message });
    }
  }

  return { limit, found: pending.length, results };
}

/**
 * Every brand's catalog, synced once daily by Vercel Cron (see
 * app/api/cron/catalog/route.ts) — this is what surfaces new products, newly
 * sold-out items, restocks, and size availability changes for every brand,
 * not just a rotating subset. Runs with bounded concurrency so it fits
 * inside the route's 60s timeout; if it doesn't quite finish, whatever
 * completed is already saved and tomorrow's run picks up the rest — brands
 * aren't marked "done" for the day, so a slow run just means a brand's
 * refresh lands a bit later, never that it gets skipped.
 */
export async function syncStreetCatalog(): Promise<{ totalEnabled: number; results: CatalogSyncResult[] }> {
  if (!hasSupabaseCatalog()) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const brands = (await getAllBrands()).filter((brand) => brand.catalogEnabled);
  const results = await mapWithConcurrency(brands, CATALOG_SYNC_CONCURRENCY, syncSingleBrand);
  return { totalEnabled: brands.length, results };
}
