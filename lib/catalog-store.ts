import { STREET_BRANDS, type StreetBrand } from "@/lib/brands";
import { fetchBrandMetadata, type BrandMetadata } from "@/lib/brand-metadata";
import { classifyProductWithAI } from "@/lib/ai-product-classifier";
import { importBrandCatalog, type ImportedProduct } from "@/lib/source-import";
import { hasSupabaseCatalog, supabaseRest, supabaseRestAll } from "@/lib/supabase-rest";
import type { StreetProduct } from "@/lib/catalog";

type BrandRow = { id: string; slug: string; name: string; store_url: string; logo_url: string | null; instagram_url: string | null; metadata_synced_at: string | null; is_active: boolean; is_featured: boolean };
type ImageRow = { source_url: string; sort_order: number; alt_text?: string | null };
type VariantRow = { external_id: string; title: string | null; price: string | number; compare_at_price: string | number | null; available: boolean; option1: string | null; option2: string | null; option3: string | null };
type ProductRow = { id: string; brand_id: string; external_id: string; handle: string; title: string; description: string; source_url: string; price: string | number; compare_at_price: string | number | null; stock_status: "in_stock" | "sold_out"; is_preorder: boolean; category: string; tags: string[]; colors: string[]; sizes: string[]; primary_image_url: string | null; last_synced_at: string; is_active: boolean; brands: BrandRow | null; product_images: ImageRow[] | null; product_variants: VariantRow[] | null };
type PendingClassificationRow = { id: string; title: string; description: string; category: string; tags: string[]; colors: string[] };
type ProductCountRow = { brand_id: string };
type SyncRunRow = { id: string };

export type StreetBrandProfile = { slug: string; name: string; storeUrl: string; logoUrl: string | null; instagramUrl: string | null; productCount: number; featured: boolean };
export type CatalogSyncResult = { brand: string; productCount: number; ok: boolean; error?: string };
export type ClassificationRunResult = { id: string; title: string; status: "classified" | "needs_review" | "error"; group?: string; category?: string; tags?: string[]; error?: string };

const CATALOG_SYNC_BATCH_SIZE = 3;
const CLASSIFICATION_BATCH_MAX = 10;
const number = (value: string | number | null | undefined) => Number(value ?? 0);

function toStreetProduct(row: ProductRow): StreetProduct {
  const brand = row.brands;
  const images = [...(row.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((image) => image.source_url);
  return { id: row.id, slug: `${brand?.slug ?? "brand"}--${row.handle}`, handle: row.handle, brandSlug: brand?.slug ?? "brand", brandName: brand?.name ?? "Unknown brand", description: row.description, sourceUrl: row.source_url, title: row.title, price: number(row.price), compareAtPrice: row.compare_at_price === null ? undefined : number(row.compare_at_price), stockStatus: row.stock_status, isPreorder: row.is_preorder, primaryImage: row.primary_image_url ?? images[0] ?? "", images, colors: row.colors ?? [], sizes: row.sizes ?? [], category: row.category, tags: row.tags ?? [], lastSyncedAt: row.last_synced_at };
}

export async function getStoredCatalog(): Promise<StreetProduct[] | null> {
  if (!hasSupabaseCatalog()) return null;
  try {
    const rows = await supabaseRestAll<ProductRow[]>("products?select=*,brands(*),product_images(*),product_variants(*)&is_active=eq.true&order=updated_at.desc,id.desc");
    return rows.map(toStreetProduct);
  } catch (error) {
    console.error("Street database catalog read failed", error);
    return null;
  }
}

export async function getBrandDirectory(): Promise<StreetBrandProfile[]> {
  const fallback = new Map<string, StreetBrandProfile>(STREET_BRANDS.map((brand) => [brand.slug, { slug: brand.slug, name: brand.name, storeUrl: brand.storeUrl, logoUrl: brand.logoUrl ?? null, instagramUrl: null, productCount: 0, featured: Boolean(brand.featured) }]));
  if (!hasSupabaseCatalog()) return [...fallback.values()].sort((a, b) => a.name.localeCompare(b.name));
  try {
    const [rows, products] = await Promise.all([
      supabaseRest<BrandRow[]>("brands?select=*&is_active=eq.true&order=name.asc"),
      supabaseRestAll<ProductCountRow[]>("products?select=brand_id&is_active=eq.true&order=id.asc"),
    ]);
    const counts = products.reduce((map, product) => map.set(product.brand_id, (map.get(product.brand_id) ?? 0) + 1), new Map<string, number>());
    for (const row of rows) fallback.set(row.slug, { slug: row.slug, name: row.name, storeUrl: row.store_url, logoUrl: row.logo_url, instagramUrl: row.instagram_url, productCount: counts.get(row.id) ?? 0, featured: row.is_featured });
    return [...fallback.values()].sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error("Street brand directory read failed", error);
    return [...fallback.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

async function getExistingBrand(slug: string) {
  const rows = await supabaseRest<BrandRow[]>(`brands?select=*&slug=eq.${encodeURIComponent(slug)}`);
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
    },
    prefer: "resolution=merge-duplicates,return=representation",
  });
  if (!rows[0]) throw new Error(`Could not save ${brand.name}.`);
  return rows[0];
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
  return mapWithConcurrency(STREET_BRANDS, 5, async (brand) => {
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

async function saveBrandCatalog(brand: StreetBrand): Promise<CatalogSyncResult> {
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
    const variants = imported.flatMap((product) => { const productId = ids.get(product.externalId); return productId ? product.variants.map((variant) => ({ product_id: productId, external_id: variant.externalId, title: variant.title || null, price: variant.price, compare_at_price: variant.compareAtPrice ?? null, available: variant.available, option1: variant.option1 ?? null, option2: variant.option2 ?? null, option3: variant.option3 ?? null })) : []; });
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

export async function classifyPendingProducts(requestedLimit?: number) {
  if (!hasSupabaseCatalog()) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const limit = Math.max(1, Math.min(CLASSIFICATION_BATCH_MAX, Math.floor(requestedLimit ?? 5)));
  const pending = await supabaseRest<PendingClassificationRow[]>(`products?select=id,title,description,category,tags,colors&classification_status=eq.pending&is_active=eq.true&order=created_at.asc&limit=${limit}`);
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
          street_tags: classification.tags,
          street_colors: classification.colors,
          classification_status: status,
          classification_confidence: classification.confidence,
          classification_model: model,
          classification_version: 1,
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

export function getCatalogSyncPlan(requestedBatch?: number) {
  const brands = STREET_BRANDS.filter((brand) => brand.catalogEnabled);
  const batchCount = Math.max(1, Math.ceil(brands.length / CATALOG_SYNC_BATCH_SIZE));
  const automaticBatch = (Math.floor(Date.now() / 86_400_000) % batchCount) + 1;
  const batch = requestedBatch && requestedBatch >= 1 && requestedBatch <= batchCount ? requestedBatch : automaticBatch;
  const start = (batch - 1) * CATALOG_SYNC_BATCH_SIZE;
  return { batch, batchCount, totalEnabled: brands.length, brands: brands.slice(start, start + CATALOG_SYNC_BATCH_SIZE) };
}

export async function syncStreetCatalog(requestedBatch?: number) {
  if (!hasSupabaseCatalog()) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const plan = getCatalogSyncPlan(requestedBatch);
  const results: CatalogSyncResult[] = [];
  for (const brand of plan.brands) results.push(await saveBrandCatalog(brand));
  return { ...plan, results };
}
