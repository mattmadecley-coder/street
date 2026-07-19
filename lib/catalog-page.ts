import type { StreetProduct } from "@/lib/catalog";
import {
  balanceProductsByBrand,
  balanceProductsForRelevance,
  filterProductsForSearch,
  rankProductsForSearch,
} from "@/lib/catalog-ranking";
import { hasSupabaseCatalog, supabaseRest, supabaseRestAll, supabaseRestPage } from "@/lib/supabase-rest";

export { balanceProductsByBrand, balanceProductsForRelevance, filterProductsForSearch, rankProductsForSearch } from "@/lib/catalog-ranking";

type BrandRow = { slug: string; name: string } | null;
type ImageRow = { source_url: string; sort_order: number };
// Listing queries only select product_variants(external_id), which is enough to
// count options. Product detail reads fetch the full variant rows.
type VariantRow = { external_id: string; title?: string | null; price?: string | number; compare_at_price?: string | number | null; available?: boolean; option1?: string | null; option2?: string | null; option3?: string | null; image_url?: string | null };
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
  created_at: string;
  updated_at: string;
  brands: BrandRow;
  product_images: ImageRow[] | null;
  product_variants: VariantRow[] | null;
  street_group: string | null;
  street_category: string | null;
  street_type: string | null;
  street_detail: string | null;
};

type PopularityRow = { product_id: string; popularity_score: string | number };

export type CatalogSort = "relevance" | "best-sellers" | "newest" | "price-low" | "price-high";

export type CatalogPageFilters = {
  page?: number;
  q?: string;
  brand?: string;
  group?: string;
  category?: string;
  type?: string;
  detail?: string;
  color?: string;
  size?: string;
  availability?: string;
  min?: number;
  max?: number;
  sort?: string;
};

export type CatalogPage = { products: StreetProduct[]; total: number; page: number; pageSize: number };

export const CATALOG_PAGE_SIZE = 50;

export function normalizeCatalogSort(value?: string): CatalogSort {
  if (value === "best-sellers" || value === "newest" || value === "price-low" || value === "price-high") return value;
  return "relevance";
}

const number = (value: string | number | null | undefined) => Number(value ?? 0);

function toVariantSummary(row: VariantRow) {
  return { externalId: row.external_id, title: row.title ?? "", price: number(row.price), compareAtPrice: row.compare_at_price == null ? undefined : number(row.compare_at_price), available: Boolean(row.available), option1: row.option1 ?? undefined, option2: row.option2 ?? undefined, option3: row.option3 ?? undefined, imageUrl: row.image_url ?? undefined };
}

function toStreetProduct(row: ProductRow): StreetProduct {
  const images = [...(row.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((image) => image.source_url);
  const variants = row.product_variants ?? [];
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
    createdAt: row.created_at,
    streetGroup: row.street_group ?? undefined,
    streetCategory: row.street_category ?? undefined,
    streetType: row.street_type ?? undefined,
    streetDetail: row.street_detail ?? undefined,
    variantCount: variants.length,
    variants: variants.map(toVariantSummary),
  };
}

function arrayContains(value: string) {
  return `cs.{${value.replace(/[\\"]/g, "\\$&")}}`;
}

const LISTING_SELECT = [
  "id",
  "handle",
  "title",
  "description",
  "source_url",
  "price",
  "compare_at_price",
  "stock_status",
  "is_preorder",
  "category",
  "tags",
  "colors",
  "sizes",
  "primary_image_url",
  "last_synced_at",
  "created_at",
  "updated_at",
  "street_group",
  "street_category",
  "street_type",
  "street_detail",
  "brands!inner(slug,name)",
  "product_images(source_url,sort_order)",
  "product_variants(external_id)",
].join(",");

function productPath(filters: CatalogPageFilters) {
  const params = new URLSearchParams();
  const sort = normalizeCatalogSort(filters.sort);
  params.set("select", LISTING_SELECT);
  params.set("is_active", "eq.true");
  params.set("is_hidden", "eq.false");
  params.set("order", sort === "price-low" ? "price.asc,id.asc" : sort === "price-high" ? "price.desc,id.desc" : "updated_at.desc,id.desc");

  if (filters.brand) params.set("brands.slug", `eq.${filters.brand}`);
  if (filters.group) params.set("street_group", `eq.${filters.group}`);
  if (filters.category) params.set("street_category", `eq.${filters.category}`);
  if (filters.type) params.set("street_type", `eq.${filters.type}`);
  if (filters.detail) params.set("street_detail", `eq.${filters.detail}`);
  if (filters.color) params.set("colors", arrayContains(filters.color));
  if (filters.size) params.set("sizes", arrayContains(filters.size));
  if (filters.availability !== "all") params.set("stock_status", "eq.in_stock");
  if (typeof filters.min === "number" && Number.isFinite(filters.min) && filters.min > 0) params.append("price", `gte.${filters.min}`);
  if (typeof filters.max === "number" && Number.isFinite(filters.max) && filters.max > 0) params.append("price", `lte.${filters.max}`);

  return `products?${params.toString()}`;
}

async function getProductPopularityScores() {
  try {
    const rows = await supabaseRestAll<PopularityRow[]>("catalog_product_popularity?select=product_id,popularity_score");
    return new Map(rows.map((row) => [row.product_id, number(row.popularity_score)]));
  } catch (error) {
    // Keep the catalog usable if application code reaches a deployment before
    // the companion popularity view migration is available.
    console.error("Street product popularity read failed", error);
    return new Map<string, number>();
  }
}

function paginateProducts(products: StreetProduct[], requestedPage: number): CatalogPage {
  const total = products.length;
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE)));
  const from = (page - 1) * CATALOG_PAGE_SIZE;
  return { products: products.slice(from, from + CATALOG_PAGE_SIZE), total, page, pageSize: CATALOG_PAGE_SIZE };
}

function sortByPopularity(products: StreetProduct[], scores: Map<string, number>) {
  const baseIndex = new Map(products.map((product, index) => [product.id, index]));
  return [...products].sort((a, b) => {
    const scoreDifference = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
    if (scoreDifference) return scoreDifference;
    const indexDifference = (baseIndex.get(a.id) ?? 0) - (baseIndex.get(b.id) ?? 0);
    return indexDifference || a.id.localeCompare(b.id);
  });
}

export async function getCatalogPage(filters: CatalogPageFilters): Promise<CatalogPage | null> {
  if (!hasSupabaseCatalog()) return null;
  const requestedPage = Math.max(1, Math.floor(filters.page ?? 1));
  const query = filters.q?.trim();
  const sort = normalizeCatalogSort(filters.sort);

  try {
    // Relevance and Best sellers need the complete filtered inventory before
    // pagination. Search also needs the complete matching set so explicit
    // price/newest sorts can filter by text without losing their primary order.
    if (query || sort === "relevance" || sort === "best-sellers") {
      const rows = await supabaseRestAll<ProductRow[]>(productPath({ ...filters, q: undefined, sort }));
      const products = rows.map(toStreetProduct);

      if (sort === "relevance") {
        return paginateProducts(query ? balanceProductsForRelevance(products, query) : balanceProductsByBrand(products), requestedPage);
      }

      const matchingProducts = query ? filterProductsForSearch(products, query) : products;
      if (sort === "best-sellers") {
        return paginateProducts(sortByPopularity(matchingProducts, await getProductPopularityScores()), requestedPage);
      }

      // Explicit Newest/price sorts keep productPath's database ordering. Search
      // only removes nonmatches; it does not reorder the requested sort.
      return paginateProducts(matchingProducts, requestedPage);
    }

    let page = requestedPage;
    let from = (page - 1) * CATALOG_PAGE_SIZE;
    let result = await supabaseRestPage<ProductRow>(productPath({ ...filters, sort }), { from, to: from + CATALOG_PAGE_SIZE - 1 });
    const lastPage = Math.max(1, Math.ceil(result.total / CATALOG_PAGE_SIZE));
    if (result.total > 0 && page > lastPage) {
      page = lastPage;
      from = (page - 1) * CATALOG_PAGE_SIZE;
      result = await supabaseRestPage<ProductRow>(productPath({ ...filters, sort }), { from, to: from + CATALOG_PAGE_SIZE - 1 });
    }
    return { products: result.data.map(toStreetProduct), total: result.total, page, pageSize: CATALOG_PAGE_SIZE };
  } catch (error) {
    console.error("Street paged catalog read failed", error);
    return null;
  }
}

/** Fetch every product matching the given filters, using stable catalog pages. */
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

/** Build small homepage shelves with explicit per-brand caps. */
export async function getDiverseProductShelf(
  filters: Omit<CatalogPageFilters, "page">,
  { limit = 10, perBrandCap = 2, poolPages = 4 }: { limit?: number; perBrandCap?: number; poolPages?: number } = {}
): Promise<StreetProduct[]> {
  const pool: StreetProduct[] = [];
  for (let page = 1; page <= poolPages; page += 1) {
    const result = await getCatalogPage({ ...filters, page });
    if (!result || !result.products.length) break;
    pool.push(...result.products);
    if (pool.length >= result.total) break;
  }

  const perBrandCount = new Map<string, number>();
  const picked: StreetProduct[] = [];
  for (const product of pool) {
    const count = perBrandCount.get(product.brandSlug) ?? 0;
    if (count >= perBrandCap) continue;
    perBrandCount.set(product.brandSlug, count + 1);
    picked.push(product);
    if (picked.length >= limit) break;
  }
  if (picked.length < limit) {
    const pickedIds = new Set(picked.map((product) => product.id));
    for (const product of pool) {
      if (picked.length >= limit) break;
      if (pickedIds.has(product.id)) continue;
      picked.push(product);
    }
  }
  return picked;
}

/** Look up a single product by its brandSlug--handle slug. */
export async function getStoredProduct(slug: string): Promise<StreetProduct | null> {
  if (!hasSupabaseCatalog()) return null;
  const separator = slug.indexOf("--");
  if (separator === -1) return null;
  const brandSlug = slug.slice(0, separator);
  const handle = slug.slice(separator + 2);
  if (!brandSlug || !handle) return null;

  const params = new URLSearchParams();
  params.set("select", "*,brands!inner(slug,name),product_images(source_url,sort_order),product_variants(*)");
  params.set("brands.slug", `eq.${brandSlug}`);
  params.set("handle", `eq.${handle}`);
  params.set("is_active", "eq.true");
  params.set("is_hidden", "eq.false");
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
