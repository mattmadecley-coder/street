import type { StreetBrand } from "@/lib/brands";

export type ImportedVariant = { externalId: string; title: string; price: number; compareAtPrice?: number; available: boolean; option1?: string; option2?: string; option3?: string };
export type ImportedProduct = { externalId: string; handle: string; title: string; description: string; sourceUrl: string; price: number; compareAtPrice?: number; stockStatus: "in_stock" | "sold_out"; isPreorder: boolean; category: string; tags: string[]; images: string[]; colors: string[]; sizes: string[]; variants: ImportedVariant[] };
type RawVariant = { id: number | string; title?: string; price: number | string; compare_at_price?: number | string | null; available: boolean; option1?: string | null; option2?: string | null; option3?: string | null };
type RawProduct = { id: number | string; title: string; handle: string; body_html?: string | null; description?: string | null; product_type?: string; type?: string; tags?: string | string[]; options?: Array<{ name: string; values: string[] }>; variants?: RawVariant[]; images?: Array<{ src: string; position?: number }> | string[] };
const headers = { Accept: "application/json, text/html, text/plain, */*", "User-Agent": "Mozilla/5.0 (compatible; StreetCatalog/1.0)" };
const colors = ["black", "white", "gray", "grey", "blue", "navy", "green", "army", "brown", "tan", "cream", "red", "purple", "yellow", "pink", "camo"];
const text = (value = "") => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const money = (value: number | string | null | undefined, cents: boolean) => { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? Number((cents ? parsed / 100 : parsed).toFixed(2)) : 0; };
const category = (title: string, type: string) => { const value = `${title} ${type}`.toLowerCase(); if (/decal|sticker/.test(value)) return "Decals"; if (/keychain|air freshener|accessor|balaclava|beanie|hat|cap/.test(value)) return "Accessories"; if (/denim|jean/.test(value)) return "Denim"; if (/cargo|sweatpant|pants|trouser/.test(value)) return "Pants"; if (/short/.test(value)) return "Shorts"; if (/jacket|coat|outerwear/.test(value)) return "Outerwear"; if (/hoodie|hooded|zip[ -]?up|sweatshirt/.test(value)) return "Hoodies & Sweatshirts"; if (/tee|t-shirt|t shirt/.test(value)) return "T-Shirts"; if (/polo|rugby|thermal|shirt/.test(value)) return "Tops"; return type || "Other"; };

function normalize(raw: RawProduct, brand: StreetBrand, cents: boolean): ImportedProduct {
  const productType = raw.product_type ?? raw.type ?? "";
  const description = text(raw.body_html ?? raw.description ?? "");
  const tags = Array.isArray(raw.tags) ? raw.tags : (raw.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
  const variants = (raw.variants ?? []).map((variant) => ({ externalId: String(variant.id), title: variant.title ?? [variant.option1, variant.option2, variant.option3].filter((value): value is string => typeof value === "string").join(" / "), price: money(variant.price, cents), compareAtPrice: variant.compare_at_price ? money(variant.compare_at_price, cents) : undefined, available: Boolean(variant.available), option1: variant.option1 ?? undefined, option2: variant.option2 ?? undefined, option3: variant.option3 ?? undefined }));
  const options = raw.options ?? [];
  const colorOption = options.find((option) => /color|colour/.test(option.name));
  const sizeOption = options.find((option) => /size/.test(option.name));
  const haystack = `${raw.title} ${productType} ${tags.join(" ")} ${description}`.toLowerCase();
  const productColors = colorOption?.values?.length ? colorOption.values : colors.filter((value) => haystack.includes(value));
  const sizes = sizeOption?.values?.length ? sizeOption.values : [...new Set(variants.flatMap((variant) => [variant.option1, variant.option2, variant.option3]).filter((value): value is string => typeof value === "string" && /^(xxs|xs|s|m|l|xl|xxl|\d{2,3})$/i.test(value)))];
  const images = (raw.images ?? []).map((image, index) => ({ src: typeof image === "string" ? image : image.src, position: typeof image === "string" ? index : image.position ?? index })).sort((a, b) => a.position - b.position).map((image) => image.src.startsWith("//") ? `https:${image.src}` : image.src);
  const productCategory = category(raw.title, productType);
  const generated = new Set(["streetwear", productCategory.toLowerCase(), ...tags.map((tag) => tag.toLowerCase()), ...productColors.map((color) => color.toLowerCase())]);
  if (/moto|bike|motocross|racing/.test(haystack)) ["moto", "motorcycle", "racing"].forEach((tag) => generated.add(tag));
  if (/cargo|utility|military|army|infantry/.test(haystack)) ["utility", "workwear", "military"].forEach((tag) => generated.add(tag));
  if (/pre[ -]?order|made to order|made-to-order/.test(haystack)) generated.add("pre-order");
  return { externalId: String(raw.id), handle: raw.handle, title: raw.title, description, sourceUrl: `${brand.storeUrl.replace(/\/$/, "")}/products/${raw.handle}`, price: variants[0]?.price ?? 0, compareAtPrice: variants[0]?.compareAtPrice, stockStatus: variants.some((variant) => variant.available) ? "in_stock" : "sold_out", isPreorder: generated.has("pre-order"), category: productCategory, tags: [...generated], images, colors: productColors, sizes, variants };
}

// A brand site that hangs (never responds) would otherwise block an entire
// cron batch until Vercel's own function timeout kills the whole run — this
// timeout ensures one slow/unresponsive brand only ever costs its own budget.
const FETCH_TIMEOUT_MS = 15_000;
async function json<T>(url: string): Promise<T | null> { try { const response = await fetch(url, { cache: "no-store", headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }); return response.ok ? JSON.parse(await response.text()) as T : null; } catch { return null; } }
async function handles(base: string) { try { const response = await fetch(`${base}/collections/all`, { cache: "no-store", headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }); if (!response.ok) return []; const items = new Set<string>(); for (const match of (await response.text()).matchAll(/\/products\/([a-z0-9-]+)/gi)) items.add(match[1]); return [...items].slice(0, 120); } catch { return []; } }

// ---------------------------------------------------------------------
// Tier 3: generic fallback for stores tiers 1 & 2 can't read at all.
//
// Some brand storefronts render full product data server-side even though
// the standard Shopify JSON endpoints (/products.json, /products/x.js) are
// blocked or don't exist (a custom headless storefront, or a Shopify store
// with the AJAX API disabled). This tier discovers product page URLs from
// the site's sitemap.xml — which works no matter what platform or
// rendering strategy the store uses, since it's a static file most stores
// publish for SEO — then extracts data from whichever of two very common
// embedding patterns the page actually has: a framework hydration payload
// (Remix/Next apps built on top of Shopify, which still expose
// Shopify-shaped product data even though there's no public JSON API) or
// standard schema.org JSON-LD (close to universal for storefront SEO,
// regardless of platform). Only ever used when tiers 1 and 2 both find
// nothing, so it can't change behavior for brands that already work.
// ---------------------------------------------------------------------

const GENERIC_FETCH_CONCURRENCY = 6;
const MAX_GENERIC_CANDIDATES = 150;

async function mapWithConcurrency<T, R>(items: T[], limit: number, callback: (item: T) => Promise<R>): Promise<R[]> {
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

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: "no-store", headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("xml")) return null;
    return await response.text();
  } catch {
    return null;
  }
}

// A sitemap's product URLs don't all follow the Shopify-ish "/products/x"
// convention (seen in the wild: "/product/x" singular, "/shop/p/x") — so
// this can't just be a single regex on the full path. Instead: split into
// segments, reject anything that's obviously not a product page (cart,
// account, policy pages, bare category pages, ...), then accept it only if
// one of the remaining segments is exactly "product", "products", or the
// very common single-letter "p" shorthand some site builders use.
const NON_PRODUCT_PATH_SEGMENTS = new Set([
  "cart", "checkout", "account", "admin", "login", "register", "signup",
  "policies", "policy", "privacy", "terms", "about", "contact", "faq",
  "search", "blog", "pages", "page", "api", "home", "sustainability",
  "foundation", "sizing", "cookie", "collections", "collection",
]);
function looksLikeProductPath(pathname: string): boolean {
  const segments = pathname.toLowerCase().split("/").filter(Boolean);
  if (!segments.length) return false;
  if (segments.some((segment) => NON_PRODUCT_PATH_SEGMENTS.has(segment))) return false;
  return segments.some((segment) => segment === "product" || segment === "products" || segment === "p");
}

/** Product page URLs from /sitemap.xml (and /sitemap_products_1.xml, a common Shopify sub-sitemap name), filtered to paths that look like a product detail page. Works regardless of how the page itself renders — even a fully client-rendered storefront (nothing scrapeable in its HTML) still has plain static sitemap URLs to discover product pages from. */
async function sitemapProductUrls(base: string): Promise<string[]> {
  const candidates = ["/sitemap.xml", "/sitemap_products_1.xml"];
  const urls = new Set<string>();
  for (const path of candidates) {
    const xml = await fetchHtml(`${base}${path}`);
    if (!xml) continue;
    for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
      const loc = match[1].trim();
      try {
        if (looksLikeProductPath(new URL(loc).pathname)) urls.add(loc);
      } catch {
        // ignore malformed <loc> entries
      }
    }
    if (urls.size) break; // a real product sitemap was found — no need to also check the fallback name
  }
  return [...urls];
}

/** Every candidate product-page URL this tier can find, from every discovery method combined (a site missing one of these — e.g. sitemap.xml blocked — may still be caught by the other). */
async function candidateProductUrls(base: string): Promise<string[]> {
  const urls = new Set<string>();
  for (const url of await sitemapProductUrls(base)) urls.add(url);
  // Shopify-style discovery, reused from tier 2: catches stores whose
  // sitemap is missing/blocked but whose /collections/all page still lists
  // real /products/{handle} links server-side (tier 2 itself already
  // fetched these handles — its failure mode was the *next* step,
  // fetching {handle}.js, not finding the handles in the first place).
  for (const handle of await handles(base)) urls.add(`${base}/products/${handle}`);
  return [...urls].slice(0, MAX_GENERIC_CANDIDATES);
}

/** Finds the matching closing brace for a `{...}` literal starting at `start`, ignoring braces inside string literals. A naive indexOf("};") can cut the JSON short since the payload itself can contain that substring inside a string value. */
function balancedJsonSlice(source: string, start: number): string | null {
  let depth = 0;
  let inString: string | null = null;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === inString) inString = null;
      continue;
    }
    if (char === '"' || char === "'") { inString = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}") { depth -= 1; if (depth === 0) return source.slice(start, i + 1); }
  }
  return null;
}

/** Digs through a parsed hydration payload (Remix's __remixContext.state.loaderData, or Next's __NEXT_DATA__.props) for the first object that looks like a Shopify product (a `variants` array plus a `title`). */
function findShopifyShapedProduct(container: unknown): Record<string, unknown> | null {
  if (!container || typeof container !== "object") return null;
  const record = container as Record<string, unknown>;
  if (Array.isArray(record.variants) && typeof record.title === "string") return record;
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const found = findShopifyShapedProduct(value);
      if (found) return found;
    }
  }
  return null;
}

function extractHydrationProduct(html: string): Record<string, unknown> | null {
  const remixMarker = "window.__remixContext = ";
  const remixStart = html.indexOf(remixMarker);
  if (remixStart !== -1) {
    const jsonText = balancedJsonSlice(html, remixStart + remixMarker.length);
    if (jsonText) {
      try {
        const parsed = JSON.parse(jsonText) as { state?: { loaderData?: unknown } };
        const found = findShopifyShapedProduct(parsed.state?.loaderData);
        if (found) return found;
      } catch {
        // fall through to the Next.js check below
      }
    }
  }
  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextMatch) {
    try {
      const parsed = JSON.parse(nextMatch[1]) as { props?: unknown };
      const found = findShopifyShapedProduct(parsed.props);
      if (found) return found;
    } catch {
      // no usable Next.js payload either
    }
  }
  return null;
}

/** Normalizes a Shopify-shaped product object pulled out of a Remix/Next hydration payload (real-world example: {id, title, descriptionHtml, images: string[], prices: {minPrice, compareAtPriceRange}, variants: [{availableForSale, quantityAvailable, options: [{name, value}]}], productType, tags, handle}). */
function normalizeHydrationProduct(raw: Record<string, unknown>, sourceUrl: string): ImportedProduct | null {
  const handle = typeof raw.handle === "string" ? raw.handle : null;
  const title = typeof raw.title === "string" ? raw.title : null;
  if (!handle || !title) return null;

  const prices = (raw.prices ?? {}) as { minPrice?: string | number; compareAtPriceRange?: { minPrice?: string | number } };
  const basePrice = money(prices.minPrice, false);
  const compareAtPrice = money(prices.compareAtPriceRange?.minPrice, false) || undefined;

  const rawVariants = Array.isArray(raw.variants) ? (raw.variants as Array<Record<string, unknown>>) : [];
  const variants: ImportedVariant[] = rawVariants.map((variant, index) => {
    const options = Array.isArray(variant.options) ? (variant.options as Array<{ name?: string; value?: string }>) : [];
    const sizeOption = options.find((option) => /size/i.test(option.name ?? ""));
    const colorOption = options.find((option) => /colou?r/i.test(option.name ?? ""));
    const quantity = typeof variant.quantityAvailable === "number" ? variant.quantityAvailable : undefined;
    return {
      externalId: typeof variant.id === "string" ? variant.id : `${handle}-${index}`,
      title: [sizeOption?.value, colorOption?.value].filter(Boolean).join(" / "),
      price: basePrice,
      compareAtPrice,
      available: Boolean(variant.availableForSale ?? (quantity !== undefined && quantity > 0)),
      option1: sizeOption?.value,
      option2: colorOption?.value,
    };
  });

  const images = (Array.isArray(raw.images) ? (raw.images as unknown[]) : [])
    .map((image) => (typeof image === "string" ? image : (image as { src?: string })?.src))
    .filter((src): src is string => Boolean(src))
    .map((src) => (src.startsWith("//") ? `https:${src}` : src));

  const description = text(typeof raw.description === "string" ? raw.description : typeof raw.descriptionHtml === "string" ? raw.descriptionHtml : "");
  const productType = typeof raw.productType === "string" ? raw.productType : "";
  const productCategory = category(title, productType);
  const rawTags = Array.isArray(raw.tags) ? (raw.tags as unknown[]).filter((tag): tag is string => typeof tag === "string" && tag.toLowerCase() !== "isavailable") : [];
  const haystack = `${title} ${productType} ${description}`.toLowerCase();
  const productColors = colors.filter((value) => haystack.includes(value));
  const sizes = [...new Set(variants.map((variant) => variant.option1).filter((value): value is string => Boolean(value)))];

  return {
    externalId: typeof raw.id === "string" ? raw.id : handle,
    handle,
    title,
    description,
    sourceUrl,
    price: variants[0]?.price ?? basePrice,
    compareAtPrice,
    stockStatus: variants.some((variant) => variant.available) ? "in_stock" : "sold_out",
    isPreorder: false,
    category: productCategory,
    tags: [...new Set(["streetwear", productCategory.toLowerCase(), ...rawTags.map((tag) => tag.toLowerCase())])],
    images,
    colors: productColors,
    sizes,
    variants,
  };
}

type JsonLdOffer = { price?: number | string; lowPrice?: number | string; availability?: string };

/** Normalizes a schema.org Product JSON-LD block. `offers` varies by site: a single Offer, an array of Offers (one per size/SKU — common on Shopify themes), or an AggregateOffer ({lowPrice, highPrice, offerCount}) that only tells us a price range and overall stock, not per-size detail. Whichever shape it is, we can only ever recover one representative price/availability from it — good enough to list the product, not a full size matrix. */
function normalizeJsonLdProduct(raw: Record<string, unknown>, sourceUrl: string): ImportedProduct | null {
  const title = typeof raw.name === "string" ? raw.name : null;
  if (!title) return null;

  const offersRaw = raw.offers;
  const offersList: JsonLdOffer[] = Array.isArray(offersRaw) ? (offersRaw as JsonLdOffer[]) : offersRaw ? [offersRaw as JsonLdOffer] : [];
  const priceValues = offersList.map((offer) => Number(offer.price ?? offer.lowPrice ?? 0)).filter((value) => Number.isFinite(value) && value > 0);
  const price = priceValues.length ? Math.min(...priceValues) : 0;
  const available = offersList.some((offer) => /InStock/i.test(String(offer.availability ?? "")));

  // Some sites' Product JSON-LD ends up listing every image on the site
  // rather than just this product's — cap it so a bug on their end can't
  // produce a garbage-length gallery on ours.
  const imagesRaw = Array.isArray(raw.image) ? (raw.image as unknown[]) : raw.image ? [raw.image] : [];
  const images = imagesRaw.filter((src): src is string => typeof src === "string").slice(0, 10);

  const description = text(typeof raw.description === "string" ? raw.description : "");
  const handle = (() => {
    try {
      const path = new URL(sourceUrl).pathname.split("/").filter(Boolean);
      return (path[path.length - 1] || title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    } catch {
      return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    }
  })();
  const productCategory = category(title, typeof raw.category === "string" ? raw.category : "");
  const haystack = `${title} ${description}`.toLowerCase();
  const productColors = colors.filter((value) => haystack.includes(value));

  return {
    externalId: typeof raw.sku === "string" ? raw.sku : handle,
    handle,
    title,
    description,
    sourceUrl,
    price,
    stockStatus: available ? "in_stock" : "sold_out",
    isPreorder: false,
    category: productCategory,
    tags: ["streetwear", productCategory.toLowerCase()],
    images,
    colors: productColors,
    sizes: [],
    variants: [{ externalId: handle, title: "", price, available }],
  };
}

function extractJsonLdProduct(html: string): Record<string, unknown> | null {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      const candidates = Array.isArray(parsed) ? parsed : parsed?.["@graph"] ? parsed["@graph"] : [parsed];
      const product = (candidates as Array<Record<string, unknown>>).find((entry) => entry?.["@type"] === "Product");
      if (product) return product;
    } catch {
      // not valid JSON — try the next script block
    }
  }
  return null;
}

async function importViaGenericScrape(brand: StreetBrand): Promise<ImportedProduct[]> {
  const base = brand.storeUrl.replace(/\/$/, "");
  const candidateUrls = await candidateProductUrls(base);
  if (!candidateUrls.length) return [];

  const results = await mapWithConcurrency(candidateUrls, GENERIC_FETCH_CONCURRENCY, async (url) => {
    const html = await fetchHtml(url);
    if (!html) return null;
    const hydrationProduct = extractHydrationProduct(html);
    if (hydrationProduct) {
      const normalized = normalizeHydrationProduct(hydrationProduct, url);
      if (normalized) return normalized;
    }
    const jsonLdProduct = extractJsonLdProduct(html);
    if (jsonLdProduct) return normalizeJsonLdProduct(jsonLdProduct, url);
    return null;
  });

  return results.filter((product): product is ImportedProduct => product !== null);
}

export async function importBrandCatalog(brand: StreetBrand): Promise<ImportedProduct[]> {
  const base = brand.storeUrl.replace(/\/$/, "");
  const feed = await json<{ products?: RawProduct[] }>(`${base}/products.json?limit=250`);
  if (feed?.products?.length) return feed.products.map((product) => normalize(product, brand, false));

  const productHandles = await handles(base);
  const products = await Promise.all(productHandles.map(async (handle) => {
    const product = await json<RawProduct>(`${base}/products/${handle}.js`);
    return product ? normalize(product, brand, true) : null;
  }));
  const found = products.filter((product): product is ImportedProduct => product !== null);
  if (found.length) return found;

  return importViaGenericScrape(brand);
}
