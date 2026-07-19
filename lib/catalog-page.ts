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

type CandidateRow = {
  id: string;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  tags?: string[] | null;
  colors?: string[] | null;
  street_group?: string | null;
  street_category?: string | null;
  street_type?: string | null;
  street_detail?: string | null;
  brands: BrandRow;
};

type CatalogCandidate = {
  id: string;
  brandSlug: string;
  brandName: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  colors: string[];
  streetGroup?: string;
  streetCategory?: string;
  streetType?: string;
  streetDetail?: string;
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

function toCatalogCandidate(row: CandidateRow): CatalogCandidate {
  return {
    id: row.id,
    brandSlug: row.brands?.slug ?? "brand",
    brandName: row.brands?.name ?? "Unknown brand",
    title: row.title ?? "",
    description: row.description ?? "",
    category: row.category ?? "",
    tags: row.tags ?? [],
    colors: row.colors ?? [],
    streetGroup: row.street_group ?? undefined,
    streetCategory: row.street_category ?? undefined,
    streetType: row.street_type ?? undefined,
    streetDetail: row.street_detail ?? undefined,
  };
}

function arrayContains(value: string) {
  return `cs.{${value.replace(/[\\"]/g, "\\$&")}}`;
}

const LISTING_SELECT = [
  "id", "handle", "title", "description", "source_url", "price", "compare_at_price", "stock_status", "is_preorder", "category", "tags", "colors", "sizes", "primary_image_url", "last_synced_at", "created_at", "updated_at", "street_group", "street_category", "street_type", "street_detail", "brands!inner(slug,name)", "product_images(source_url,sort_order)", "product_variants(external_id)",
].join(",");
const BALANCE_SELECT = "id,brands!inner(slug,name)";
const SEARCH_SELECT = "id,title,description,category,tags,colors,street_group,street_category,street_type,street_detail,brands!inner(slug,name)";

function productPath(filters: CatalogPageFilters, select = LISTING_SELECT) {
  const params = new URLSearchParams();
  const sort = normalizeCatalogSort(filters.sort);
  params.set("select", select);
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

function selectedProductsPath(ids: string[]) {
  const params = new URLSearchParams();
  params.set("select", LISTING_SELECT);
  params.set("is_active", "eq.true");
  params.set("is_hidden", "eq.false");
  params.set("id", `in.(${ids.join(",")})`);
  return `products?${params.toString()}`;
}

async function getProductPopularityScores() {
  try {
    const rows = await supabaseRestAll<PopularityRow[]>("catalog_product_popularity?select=product_id,popularity_score");
    return new Map(rows.map((row) => [row.product_id, number(row.popularity_score)]));
  } catch (error) {
    console.error("Street product popularity read failed", error);
    return new Map<string, number>();
  }
}

async function hydrateCandidatePage(candidates: CatalogCandidate[], requestedPage: number): Promise<CatalogPage> {
  const total = candidates.length;
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE)));
  const from = (page - 1) * CATALOG_PAGE_SIZE;
  const pageIds = candidates.slice(from, from + CATALOG_PAGE_SIZE).map((candidate) => candidate.id);
  if (!pageIds.length) return { products: [], total, page, pageSize: CATALOG_PAGE_SIZE };

  const rows = await supabaseRest<ProductRow[]>(selectedProductsPath(pageIds));
  const byId = new Map(rows.map((row) => [row.id, toStreetProduct(row)]));
  return { products: pageIds.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []), total, page, pageSize: CATALOG_PAGE_SIZE };
}

function sortByPopularity<T extends { id: string }>(products: T[], scores: Map<string, number>) {
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
    // Rank the complete filtered result set using lightweight rows, paginate the
    // resulting ID order, then hydrate only the requested page's cards. This is
    // global balancing without loading every product image/variant before slice.
    if (query || sort === "relevance" || sort === "best-sellers") {
      const select = query ? SEARCH_SELECT : BALANCE_SELECT;
      const rows = await supabaseRestAll<CandidateRow[]>(productPath({ ...filters, q: undefined, sort }, select));
      const candidates = rows.map(toCatalogCandidate);

      if (sort === "relevance") {
        return hydrateCandidatePage(query ? balanceProductsForRelevance(candidates, query) : balanceProductsByBrand(candidates), requestedPage);
      }

      const matchingProducts = query ? filterProductsForSearch(candidates, query) : candidates;
      if (sort === "best-sellers") {
        return hydrateCandidatePage(sortByPopularity(matchingProducts, await getProductPopularityScores()), requestedPage);
      }

      // Explicit Newest/price sorts keep productPath's database ordering. Search
      // only removes nonmatches; it does not reorder the requested sort.
      return hydrateCandidatePage(matchingProducts, requestedPage);
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
