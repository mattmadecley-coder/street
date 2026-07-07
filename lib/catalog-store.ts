import { STREET_BRANDS, type StreetBrand } from "@/lib/brands";
import { importBrandCatalog, type ImportedProduct } from "@/lib/source-import";
import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";
import type { StreetProduct } from "@/lib/catalog";

type BrandRow = { id: string; slug: string; name: string; store_url: string; logo_url: string | null; is_active: boolean; is_featured: boolean };
type ImageRow = { source_url: string; sort_order: number; alt_text?: string | null };
type VariantRow = { external_id: string; title: string | null; price: string | number; compare_at_price: string | number | null; available: boolean; option1: string | null; option2: string | null; option3: string | null };
type ProductRow = {
  id: string;
  brand_id: string;
  external_id: string;
  handle: string;
  title: string;
  description: string;
  source_url: string;
  price: string | number;
  compare_at_price: string | number | null;
  stock_status: "in_stock" | "sold_out";
  is_preorder: boolean;
  category: string;
  tags: string[];
  colors: string[];
  sizes: string[];
  primary_image_url: string | null;
  last_synced_at: string;
  is_active: boolean;
  brands: BrandRow | null;
  product_images: ImageRow[] | null;
  product_variants: VariantRow[] | null;
};
type SyncRunRow = { id: string };

const number = (value: string | number | null | undefined) => Number(value ?? 0);

function toStreetProduct(row: ProductRow): StreetProduct {
  const brand = row.brands;
  const images = [...(row.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((image) => image.source_url);
  return {
    id: row.id,
    slug: `${brand?.slug ?? "brand"}--${row.handle}`,
    handle: row.handle,
    brandSlug: brand?.slug ?? "brand",
    brandName: brand?.name ?? "Unknown brand",
    description: row.description,
    sourceUrl: row.source_url,
    title: row.title,
    price: number(row.price),
    compareAtPrice: row.compare_at_price === null ? undefined : number(row.compare_at_price),
    stockStatus: row.stock_status,
    isPreorder: row.is_preorder,
    primaryImage: row.primary_image_url ?? images[0] ?? "",
    images,
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
    category: row.category,
    tags: row.tags ?? [],
    lastSyncedAt: row.last_synced_at,
  };
}

export async function getStoredCatalog(): Promise<StreetProduct[] | null> {
  if (!hasSupabaseCatalog()) return null;
  try {
    const rows = await supabaseRest<ProductRow[]>("products?select=*,brands(*),product_images(*),product_variants(*)&is_active=eq.true&order=updated_at.desc");
    return rows.map(toStreetProduct);
  } catch (error) {
    console.error("Street database catalog read failed", error);
    return null;
  }
}

async function upsertBrand(brand: StreetBrand) {
  const rows = await supabaseRest<BrandRow[]>("brands?on_conflict=slug", {
    method: "POST",
    body: {
      slug: brand.slug,
      name: brand.name,
      store_url: brand.storeUrl,
      logo_url: brand.logoUrl ?? null,
      is_active: true,
      is_featured: Boolean(brand.featured),
    },
    prefer: "resolution=merge-duplicates,return=representation",
  });
  if (!rows[0]) throw new Error(`Could not save ${brand.name}.`);
  return rows[0];
}

function databaseProduct(brandId: string, product: ImportedProduct) {
  return {
    brand_id: brandId,
    external_id: product.externalId,
    handle: product.handle,
    title: product.title,
    description: product.description,
    source_url: product.sourceUrl,
    price: product.price,
    compare_at_price: product.compareAtPrice ?? null,
    stock_status: product.stockStatus,
    is_preorder: product.isPreorder,
    category: product.category,
    tags: product.tags,
    colors: product.colors,
    sizes: product.sizes,
    primary_image_url: product.images[0] ?? null,
    is_active: true,
    last_synced_at: new Date().toISOString(),
  };
}

async function saveBrandCatalog(brand: StreetBrand) {
  const brandRow = await upsertBrand(brand);
  const runRows = await supabaseRest<SyncRunRow[]>("catalog_sync_runs", {
    method: "POST",
    body: { brand_id: brandRow.id, status: "running" },
  });
  const runId = runRows[0]?.id;

  try {
    const imported = await importBrandCatalog(brand);
    if (!imported.length) throw new Error("The brand source did not return any products.");

    // Only flip existing items inactive after a successful full-source response.
    await supabaseRest(`products?brand_id=eq.${brandRow.id}`, {
      method: "PATCH",
      body: { is_active: false },
      prefer: "return=minimal",
    });

    const saved = await supabaseRest<Array<{ id: string; external_id: string }>>("products?on_conflict=brand_id,external_id", {
      method: "POST",
      body: imported.map((product) => databaseProduct(brandRow.id, product)),
      prefer: "resolution=merge-duplicates,return=representation",
    });
    const ids = new Map(saved.map((product) => [product.external_id, product.id]));

    await Promise.all(saved.flatMap((product) => [
      supabaseRest(`product_images?product_id=eq.${product.id}`, { method: "DELETE", prefer: "return=minimal" }),
      supabaseRest(`product_variants?product_id=eq.${product.id}`, { method: "DELETE", prefer: "return=minimal" }),
    ]));

    const images = imported.flatMap((product) => {
      const productId = ids.get(product.externalId);
      return productId ? product.images.map((sourceUrl, sortOrder) => ({ product_id: productId, source_url: sourceUrl, sort_order: sortOrder, alt_text: product.title })) : [];
    });
    const variants = imported.flatMap((product) => {
      const productId = ids.get(product.externalId);
      return productId ? product.variants.map((variant) => ({
        product_id: productId,
        external_id: variant.externalId,
        title: variant.title || null,
        price: variant.price,
        compare_at_price: variant.compareAtPrice ?? null,
        available: variant.available,
        option1: variant.option1 ?? null,
        option2: variant.option2 ?? null,
        option3: variant.option3 ?? null,
      })) : [];
    });
    if (images.length) await supabaseRest("product_images", { method: "POST", body: images, prefer: "return=minimal" });
    if (variants.length) await supabaseRest("product_variants", { method: "POST", body: variants, prefer: "return=minimal" });

    if (runId) await supabaseRest(`catalog_sync_runs?id=eq.${runId}`, {
      method: "PATCH",
      body: { status: "success", completed_at: new Date().toISOString(), product_count: imported.length },
      prefer: "return=minimal",
    });
    return { brand: brand.slug, productCount: imported.length, ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    if (runId) await supabaseRest(`catalog_sync_runs?id=eq.${runId}`, {
      method: "PATCH",
      body: { status: "failed", completed_at: new Date().toISOString(), error_message: message },
      prefer: "return=minimal",
    }).catch(() => undefined);
    return { brand: brand.slug, productCount: 0, ok: false as const, error: message };
  }
}

export async function syncStreetCatalog() {
  if (!hasSupabaseCatalog()) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel first.");
  const results = [];
  for (const brand of STREET_BRANDS) results.push(await saveBrandCatalog(brand));
  return results;
}
