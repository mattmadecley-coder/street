import type { StreetProduct } from "@/lib/catalog";
import { hasSupabaseCatalog, supabaseRest, supabaseRestPage } from "@/lib/supabase-rest";

type BrandRow = { slug: string; name: string } | null;
type ImageRow = { source_url: string; sort_order: number };
type ProductRow = {
  id: string;
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
  brands: BrandRow;
  product_images: ImageRow[] | null;
  // Street taxonomy (lib/street-taxonomy.ts), set once a product has been
  // classified. Null until then.
  street_group: string | null;
  street_category: string | null;
  street_type: string | null;
  street_detail: string | null;
};

export type CatalogPageFilters = {
  page?: number;
  q?: string;
  brand?: string;
  /** Street taxonomy group filter, e.g. "Footwear" / "Apparel" (street_group column). */
  group?: string;
  /** Street taxonomy category filter, e.g. "Sneakers" / "Tops" (street_category column). */
  category?: string;
  /** Street taxonomy type filter, e.g. "T-Shirts" / "Hoodies" (street_type column). */
  type?: string;
  color?: string;
  size?: string;
  availability?: string;
  min?: number;
  max?: number;
  sort?: string;
};

export type CatalogPage = { products: StreetProduct[]; total: number; page: number; pageSize: number };

export const CATALOG_PAGE_SIZE = 50;

const number = (value: string | number | null | undefined) => Number(value ?? 0);

function toStreetProduct(row: ProductRow): StreetProduct {
  const images = [...(row.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((image) => image.source_url);
  return {
    id: row.id,
    slug: `${row.brands?.slug ?? "brand"}--${row.handle}`,
    handle: row.handle,
    brandSlug: row.brands?.slug ?? "brand",
    brandName: row.brands?.name ?? "Unknown brand",
    title: row.title,
    description: row.description,
    sourceUrl: row.source_url,
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
    streetGroup: row.street_group ?? undefined,
    streetCategory: row.street_category ?? undefined,
    streetType: row.street_type ?? undefined,
    streetDetail: row.street_detail ?? undefined,
  };
}

function arrayContains(value: string) {
  return `cs.{${value.replace(/[\\"]/g, "\\$&")}}`;
}

function productPath(filters: CatalogPageFilters) {
  const params = new URLSearchParams();
  params.set("select", "*,brands!inner(slug,name),product_images(source_url,sort_order)");
  params.set("is_active", "eq.true");
  params.set("order", filters.sort === "price-low" ? "price.asc,id.asc" : filters.sort === "price-high" ? "price.desc,id.desc" : "updated_at.desc,id.desc");

  if (filters.brand) params.set("brands.slug", `eq.${filters.brand}`);
  if (filters.group) params.set("street_group", `eq.${filters.group}`);
  if (filters.category) params.set("street_category", `eq.${filters.category}`);
  if (filters.type) params.set("street_type", `eq.${filters.type}`);
  if (filters.color) params.set("colors", arrayContains(filters.color));
  if (filters.size) params.set("sizes", arrayContains(filters.size));
  if (filters.availability !== "all") params.set("stock_status", "eq.in_stock");
  if (typeof filters.min === "number" && Number.isFinite(filters.min) && filters.min > 0) params.set("price", `gte.${filters.min}`);
  if (typeof filters.max === "number" && Number.isFinite(filters.max) && filters.max > 0) params.set("price", `lte.${filters.max}`);

  const query = filters.q?.trim().replace(/[%,()]/g, " ").replace(/\s+/g, " ");
  if (query) params.set("or", `(title.ilike.*${query}*,description.ilike.*${query}*)`);

  return `products?${params.toString()}`;
}

export async function getCatalogPage(filters: CatalogPageFilters): Promise<CatalogPage | null> {
  if (!hasSupabaseCatalog()) return null;
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const from = (page - 1) * CATALOG_PAGE_SIZE;

  try {
    const result = await supabaseRestPage<ProductRow>(productPath(filters), { from, to: from + CATALOG_PAGE_SIZE - 1 });
    return { products: result.data.map(toStreetProduct), total: result.total, page, pageSize: CATALOG_PAGE_SIZE };
  } catch (error) {
    console.error("Street paged catalog read failed", error);
    return null;
  }
}

/**
 * Fetch every product matching the given filters from Supabase, paging
 * through CATALOG_PAGE_SIZE at a time until everything is collected. This is
 * for single-brand showcase pages (which want "all of this brand's pieces",
 * not a paginated slice) — it still only queries the matching brand's rows,
 * not the whole multi-brand catalog, so it stays cheap even for brands with
 * a few hundred SKUs.
 */
export async function getAllCatalogProducts(filters: Omit<CatalogPageFilters, "page">): Promise<{ products: StreetProduct[]; total: number } | null> {
  const first = await getCatalogPage({ ...filters, page: 1 });
  if (!first) return null;

  const products = [...first.products];
  let page = 2;
  while (products.length < first.total) {
    const next = await getCatalogPage({ ...filters, page });
    if (!next || !next.products.length) break;
    products.push(...next.products);
    page += 1;
  }
  return { products, total: first.total };
}

/**
 * Look up a single product by its `brandSlug--handle` slug directly in
 * Supabase, instead of pulling the entire catalog into memory and scanning
 * it. This is what product detail pages should use: it's the difference
 * between one filtered row fetch and downloading every brand's full catalog
 * (images + variants included) just to show one item.
 */
export async function getStoredProduct(slug: string): Promise<StreetProduct | null> {
  if (!hasSupabaseCatalog()) return null;
  const separator = slug.indexOf("--");
  if (separator === -1) return null;
  const brandSlug = slug.slice(0, separator);
  const handle = slug.slice(separator + 2);
  if (!brandSlug || !handle) return null;

  const params = new URLSearchParams();
  params.set("select", "*,brands!inner(slug,name),product_images(source_url,sort_order)");
  params.set("brands.slug", `eq.${brandSlug}`);
  params.set("handle", `eq.${handle}`);
  params.set("is_active", "eq.true");
  params.set("limit", "1");

  try {
    const rows = await supabaseRest<ProductRow[]>(`products?${params.toString()}`);
    const row = rows[0];
    return row ? toStreetProduct(row) : null;
  } catch (error) {
    console.error("Street single-product lookup failed", error);
    return null;
  }
}
