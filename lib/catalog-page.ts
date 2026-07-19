import type { StreetProduct } from "@/lib/catalog";
import { hasSupabaseCatalog, supabaseRest, supabaseRestAll, supabaseRestPage } from "@/lib/supabase-rest";

type BrandRow = { slug: string; name: string } | null;
type ImageRow = { source_url: string; sort_order: number };
// Listing queries (productPath, below) only select product_variants(external_id) -
// just enough to count options - to keep the catalog grid/homepage
// shelves cheap. getStoredProduct selects the full row (title/price/
// availability/options) since the product detail page shows each one.
// Every field but external_id is therefore optional here.
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
  brands: BrandRow;
  product_images: ImageRow[] | null;
  product_variants: VariantRow[] | null;
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

const SEARCH_STOP_WORDS = new Set(["a", "an", "and", "for", "in", "of", "on", "or", "the", "to", "with"]);
const SEARCH_EQUIVALENCE_GROUPS = [
  ["jacket", "outerwear", "coat"],
  ["pant", "bottom", "trouser", "jean"],
  ["shoe", "footwear", "sneaker", "boot"],
  ["tee", "tshirt", "shirt"],
  ["hoodie", "sweatshirt", "pullover"],
  ["black", "charcoal", "onyx", "jet black"],
] as const;

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bt[\s-]?shirts?\b/g, "tshirt")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularizeSearchTerm(value: string) {
  const term = normalizeSearchText(value);
  const irregular: Record<string, string> = {
    bottoms: "bottom",
    boots: "boot",
    coats: "coat",
    hoodies: "hoodie",
    jackets: "jacket",
    jeans: "jean",
    pants: "pant",
    shirts: "shirt",
    shoes: "shoe",
    sneakers: "sneaker",
    tees: "tee",
    trousers: "trouser",
  };
  if (irregular[term]) return irregular[term];
  if (term.endsWith("ies") && term.length > 4) return `${term.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes)$/.test(term)) return term.slice(0, -2);
  if (term.endsWith("s") && !term.endsWith("ss") && term.length > 3) return term.slice(0, -1);
  return term;
}

function pluralizeSearchTerm(term: string) {
  if (!term || term.includes(" ")) return term;
  if (term.endsWith("y") && !/[aeiou]y$/.test(term)) return `${term.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(term)) return `${term}es`;
  return `${term}s`;
}

function searchTermVariants(term: string) {
  const canonical = singularizeSearchTerm(term);
  const variants = new Set([normalizeSearchText(term), canonical, pluralizeSearchTerm(canonical)]);
  const group = SEARCH_EQUIVALENCE_GROUPS.find((items) => items.some((item) => singularizeSearchTerm(item) === canonical));
  for (const item of group ?? []) {
    const normalized = normalizeSearchText(item);
    const singular = singularizeSearchTerm(normalized);
    variants.add(normalized);
    variants.add(singular);
    variants.add(pluralizeSearchTerm(singular));
  }
  return [...variants].filter(Boolean);
}

function meaningfulSearchTerms(query: string) {
  const seen = new Set<string>();
  return normalizeSearchText(query)
    .split(" ")
    .map(singularizeSearchTerm)
    .filter((term) => term.length > 1 && !SEARCH_STOP_WORDS.has(term))
    .filter((term) => {
      if (seen.has(term)) return false;
      seen.add(term);
      return true;
    })
    .map((term) => ({ term, variants: searchTermVariants(term) }));
}

function matchStrength(text: string, variants: string[]) {
  if (!text) return 0;
  const padded = ` ${text} `;
  let best = 0;
  for (const variant of variants) {
    if (!variant) continue;
    if (text === variant) best = Math.max(best, 3);
    else if (padded.includes(` ${variant} `)) best = Math.max(best, 2);
    else if (text.includes(variant)) best = Math.max(best, 1);
  }
  return best;
}

type SearchableCatalogProduct = Pick<
  StreetProduct,
  "brandSlug" | "title" | "description" | "brandName" | "category" | "tags" | "colors" | "streetGroup" | "streetCategory" | "streetType" | "streetDetail"
>;

/**
 * Search stays deterministic and database-backed: no model call occurs here.
 * Every original query term is scored independently so full-term matches rank
 * before products that only match one part of a multiword query.
 */
export function rankProductsForSearch<T extends SearchableCatalogProduct>(products: T[], query?: string): T[] {
  const terms = meaningfulSearchTerms(query ?? "");
  if (!terms.length) return products;

  const ranked = products.map((product, index) => {
    const fields: Array<[string, number]> = [
      [normalizeSearchText(product.title), 12],
      [normalizeSearchText(product.brandName), 10],
      [normalizeSearchText(product.tags.join(" ")), 9],
      [normalizeSearchText(product.colors.join(" ")), 9],
      [normalizeSearchText(product.streetGroup), 8],
      [normalizeSearchText(product.streetCategory), 9],
      [normalizeSearchText(product.streetType), 9],
      [normalizeSearchText(product.streetDetail), 8],
      [normalizeSearchText(product.category), 6],
      [normalizeSearchText(product.description), 4],
    ];

    let matchedTerms = 0;
    let score = 0;
    for (const term of terms) {
      let termMatched = false;
      let termScore = 0;
      for (const [field, weight] of fields) {
        const strength = matchStrength(field, term.variants);
        if (!strength) continue;
        termMatched = true;
        termScore += weight * strength;
      }
      if (termMatched) {
        matchedTerms += 1;
        score += termScore;
      }
    }
    return { product, index, matchedTerms, score };
  });

  return ranked
    .filter((entry) => entry.matchedTerms > 0)
    .sort((a, b) => b.matchedTerms - a.matchedTerms || b.score - a.score || a.index - b.index)
    .map((entry) => entry.product);
}

/**
 * Reorders only the products already assigned to a page. That keeps pagination
 * stable while preventing one brand from occupying the entire first screen.
 * The cap is strict near the top, then relaxes naturally farther down.
 */
export function diversifyProductsByBrand<T extends { brandSlug: string }>(
  products: T[],
  { firstPortion = 18, perBrandCap = 2 }: { firstPortion?: number; perBrandCap?: number } = {},
): T[] {
  if (products.length < 2) return products;

  const remaining = products.map((product) => ({ product }));
  const output: T[] = [];
  const counts = new Map<string, number>();
  const distinctBrands = new Set(products.map((product) => product.brandSlug || "__unbranded")).size;
  const earlyLimit = Math.min(Math.max(0, firstPortion), products.length);
  const effectiveCap = distinctBrands >= 4
    ? Math.max(1, perBrandCap)
    : distinctBrands >= 2
      ? Math.max(perBrandCap, Math.ceil(earlyLimit / distinctBrands))
      : earlyLimit;
  let previousBrand = "";

  while (remaining.length) {
    const position = output.length;
    const early = position < earlyLimit;

    const findCandidate = (respectCap: boolean, avoidConsecutive: boolean) => remaining.findIndex(({ product }) => {
      const brand = product.brandSlug || "__unbranded";
      if (avoidConsecutive && brand === previousBrand) return false;
      if (respectCap && (counts.get(brand) ?? 0) >= effectiveCap) return false;
      return true;
    });

    let candidateIndex = findCandidate(early, true);
    if (candidateIndex < 0) candidateIndex = findCandidate(false, true);
    if (candidateIndex < 0) candidateIndex = findCandidate(early, false);
    if (candidateIndex < 0) candidateIndex = 0;

    const [{ product }] = remaining.splice(candidateIndex, 1);
    const brand = product.brandSlug || "__unbranded";
    output.push(product);
    counts.set(brand, (counts.get(brand) ?? 0) + 1);
    previousBrand = brand;
  }

  return output;
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
  params.set("select", LISTING_SELECT);
  params.set("is_active", "eq.true");
  params.set("is_hidden", "eq.false");
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

  return `products?${params.toString()}`;
}

export async function getCatalogPage(filters: CatalogPageFilters): Promise<CatalogPage | null> {
  if (!hasSupabaseCatalog()) return null;
  const requestedPage = Math.max(1, Math.floor(filters.page ?? 1));
  const query = filters.q?.trim();

  try {
    if (query) {
      const rows = await supabaseRestAll<ProductRow[]>(productPath({ ...filters, q: undefined }));
      const ranked = rankProductsForSearch(rows.map(toStreetProduct), query);
      const total = ranked.length;
      const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE)));
      const from = (page - 1) * CATALOG_PAGE_SIZE;
      const products = diversifyProductsByBrand(ranked.slice(from, from + CATALOG_PAGE_SIZE));
      return { products, total, page, pageSize: CATALOG_PAGE_SIZE };
    }

    let page = requestedPage;
    let from = (page - 1) * CATALOG_PAGE_SIZE;
    let result = await supabaseRestPage<ProductRow>(productPath(filters), { from, to: from + CATALOG_PAGE_SIZE - 1 });
    const lastPage = Math.max(1, Math.ceil(result.total / CATALOG_PAGE_SIZE));
    if (result.total > 0 && page > lastPage) {
      page = lastPage;
      from = (page - 1) * CATALOG_PAGE_SIZE;
      result = await supabaseRestPage<ProductRow>(productPath(filters), { from, to: from + CATALOG_PAGE_SIZE - 1 });
    }
    return { products: diversifyProductsByBrand(result.data.map(toStreetProduct)), total: result.total, page, pageSize: CATALOG_PAGE_SIZE };
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
 * A "shelf" of products (homepage rows like New In / Under $50) that reads
 * naturally across brands instead of accidentally becoming a single-brand
 * showcase. Plain getCatalogPage(sort: newest) can return 40+ results from
 * one brand in a row right after that brand gets (re)synced, since every
 * one of its rows shares almost the same updated_at timestamp - this walks
 * a larger newest-first pool and caps how many any one brand can contribute
 * before filling the rest from other brands.
 */
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
  // If the cap left us short (e.g. too few distinct brands in the pool),
  // top up with whatever's next in newest-first order regardless of brand.
  if (picked.length < limit) {
    const pickedIds = new Set(picked.map((p) => p.id));
    for (const product of pool) {
      if (picked.length >= limit) break;
      if (pickedIds.has(product.id)) continue;
      picked.push(product);
    }
  }
  return picked;
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
