import type { StreetBrand } from "@/lib/brands";
import {
  importBrandCatalog as importDefaultBrandCatalog,
  type ImportedProduct,
  type ImportedVariant,
} from "./source-import";

export type { ImportedProduct, ImportedVariant } from "./source-import";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_CANDIDATES = 150;
const HEADERS = {
  Accept: "application/xml,text/xml,text/html,application/xhtml+xml,*/*",
  "User-Agent": "Mozilla/5.0 (compatible; StreetCatalog/1.0)",
};

const NON_PRODUCT_ROOT_SLUGS = new Set([
  "about", "account", "admin", "blog", "cart", "checkout", "collections",
  "contact", "contact-us", "faq", "foundation", "home", "legal", "login",
  "pages", "policies", "press", "privacy", "register", "returns", "search",
  "shop", "shop-3-light", "signup", "sizing", "stockists", "sustainability",
  "terms", "wp-admin", "wp-json",
]);

function stripHtml(value = "") {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function asMoney(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function sitemapLocations(xml: string) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) => match[1].trim());
}

function isRootLevelPage(url: string, base: string) {
  try {
    const parsed = new URL(url);
    const origin = new URL(base).origin;
    if (parsed.origin !== origin) return false;
    const segments = parsed.pathname.toLowerCase().split("/").filter(Boolean);
    if (segments.length !== 1) return false;
    const slug = segments[0].replace(/\.(html?|php)$/i, "");
    return Boolean(slug) && !NON_PRODUCT_ROOT_SLUGS.has(slug) && !slug.endsWith("-sitemap");
  } catch {
    return false;
  }
}

async function rootLevelProductCandidates(base: string) {
  const sitemapQueue = [
    `${base}/sitemap.xml`,
    `${base}/wp-sitemap.xml`,
    `${base}/product-sitemap.xml`,
    `${base}/wp-sitemap-posts-product-1.xml`,
  ];
  const visited = new Set<string>();
  const candidates = new Set<string>();

  while (sitemapQueue.length && visited.size < 30 && candidates.size < MAX_CANDIDATES) {
    const sitemapUrl = sitemapQueue.shift() as string;
    if (visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);

    const xml = await fetchText(sitemapUrl);
    if (!xml) continue;

    for (const location of sitemapLocations(xml)) {
      if (/\.xml(?:$|\?)/i.test(location)) {
        if (/product|post-type|wp-sitemap/i.test(location) && !visited.has(location)) sitemapQueue.push(location);
        continue;
      }
      if (isRootLevelPage(location, base)) candidates.add(location);
      if (candidates.size >= MAX_CANDIDATES) break;
    }
  }

  return [...candidates];
}

type JsonLdOffer = {
  price?: number | string;
  lowPrice?: number | string;
  availability?: string;
  sku?: string;
};

function productJsonLd(html: string): Record<string, unknown> | null {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      const roots = Array.isArray(parsed) ? parsed : parsed?.["@graph"] ? parsed["@graph"] : [parsed];
      const product = (roots as Array<Record<string, unknown>>).find((entry) => {
        const type = entry?.["@type"];
        return type === "Product" || (Array.isArray(type) && type.includes("Product"));
      });
      if (product) return product;
    } catch {
      // Keep checking other JSON-LD blocks. WordPress plugins often emit more than one.
    }
  }
  return null;
}

function classify(title: string, description: string) {
  const value = `${title} ${description}`.toLowerCase();
  if (/bag|purse|tote|handbag|shoulder|crossbody/.test(value)) return "Accessories";
  if (/hat|cap|beanie|accessor/.test(value)) return "Accessories";
  if (/denim|jean/.test(value)) return "Denim";
  if (/cargo|sweatpant|pants|trouser/.test(value)) return "Pants";
  if (/short/.test(value)) return "Shorts";
  if (/jacket|coat|outerwear/.test(value)) return "Outerwear";
  if (/hoodie|hooded|zip[ -]?up|sweatshirt/.test(value)) return "Hoodies & Sweatshirts";
  if (/tee|t-shirt|t shirt/.test(value)) return "T-Shirts";
  if (/polo|rugby|thermal|shirt/.test(value)) return "Tops";
  return "Other";
}

function normalizeJsonLd(raw: Record<string, unknown>, sourceUrl: string): ImportedProduct | null {
  const title = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!title) return null;

  const offersRaw = raw.offers;
  const offers = (Array.isArray(offersRaw) ? offersRaw : offersRaw ? [offersRaw] : []) as JsonLdOffer[];
  const prices = offers
    .map((offer) => asMoney(offer.price ?? offer.lowPrice))
    .filter((price) => price > 0);
  const price = prices.length ? Math.min(...prices) : 0;
  const available = offers.some((offer) => /InStock|PreOrder|LimitedAvailability/i.test(String(offer.availability ?? "")));
  const description = stripHtml(typeof raw.description === "string" ? raw.description : "");

  const imageRaw = Array.isArray(raw.image) ? raw.image : raw.image ? [raw.image] : [];
  const images = imageRaw
    .map((image) => typeof image === "string" ? image : (image as { url?: string; contentUrl?: string })?.url ?? (image as { contentUrl?: string })?.contentUrl)
    .filter((image): image is string => Boolean(image))
    .slice(0, 10);

  const path = new URL(sourceUrl).pathname.split("/").filter(Boolean);
  const handle = (path[path.length - 1] || title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const category = classify(title, description);
  const externalId = typeof raw.sku === "string" && raw.sku ? raw.sku : offers.find((offer) => offer.sku)?.sku ?? handle;
  const variant: ImportedVariant = {
    externalId,
    title: "",
    price,
    available,
  };

  return {
    externalId,
    handle,
    title,
    description,
    sourceUrl,
    price,
    stockStatus: available ? "in_stock" : "sold_out",
    isPreorder: offers.some((offer) => /PreOrder/i.test(String(offer.availability ?? ""))),
    category,
    tags: ["streetwear", category.toLowerCase()],
    images,
    colors: [],
    sizes: [],
    variants: [variant],
  };
}

async function importRootLevelProducts(brand: StreetBrand): Promise<ImportedProduct[]> {
  const base = brand.storeUrl.replace(/\/$/, "");
  const candidates = await rootLevelProductCandidates(base);
  const products: ImportedProduct[] = [];

  for (let index = 0; index < candidates.length; index += 6) {
    const batch = candidates.slice(index, index + 6);
    const imported = await Promise.all(batch.map(async (url) => {
      const html = await fetchText(url);
      if (!html) return null;
      const raw = productJsonLd(html);
      return raw ? normalizeJsonLd(raw, url) : null;
    }));
    products.push(...imported.filter((product): product is ImportedProduct => product !== null));
  }

  return products;
}

export async function importBrandCatalog(brand: StreetBrand): Promise<ImportedProduct[]> {
  const existing = await importDefaultBrandCatalog(brand);
  if (existing.length) return existing;

  // Homage Year (and some WordPress/WooCommerce storefronts) publish product
  // pages directly at /product-name/ instead of /product/product-name/. The
  // standard importer intentionally filters those root paths out, so only run
  // this broader JSON-LD fallback after every existing import tier finds zero.
  return importRootLevelProducts(brand);
}
