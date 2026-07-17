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
  Accept: "text/html,application/xhtml+xml,application/xml,text/xml,*/*",
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
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function asMoney(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
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

function absoluteUrl(value: string, base: string) {
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

function rootLevelCandidate(url: string, base: string) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== new URL(base).origin) return false;
    const segments = parsed.pathname.toLowerCase().split("/").filter(Boolean);
    if (segments.length !== 1) return false;
    const slug = segments[0].replace(/\.(html?|php)$/i, "");
    return Boolean(slug) && !NON_PRODUCT_ROOT_SLUGS.has(slug) && !slug.endsWith("-sitemap");
  } catch {
    return false;
  }
}

function linksFromHtml(html: string, base: string) {
  const links = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const url = absoluteUrl(match[1], base);
    if (url && rootLevelCandidate(url, base)) links.add(url);
  }
  return [...links];
}

function sitemapLocations(xml: string) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) => match[1].trim());
}

async function candidateUrls(base: string) {
  const candidates = new Set<string>();
  const pages = [base, `${base}/shop-3-light/`, `${base}/shop/`];

  for (const page of pages) {
    const html = await fetchText(page);
    if (!html) continue;
    for (const url of linksFromHtml(html, base)) candidates.add(url);
  }

  const sitemapQueue = [
    `${base}/sitemap.xml`,
    `${base}/sitemap_index.xml`,
    `${base}/wp-sitemap.xml`,
    `${base}/product-sitemap.xml`,
    `${base}/wp-sitemap-posts-product-1.xml`,
  ];
  const visited = new Set<string>();

  while (sitemapQueue.length && visited.size < 30 && candidates.size < MAX_CANDIDATES) {
    const sitemapUrl = sitemapQueue.shift() as string;
    if (visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);
    const xml = await fetchText(sitemapUrl);
    if (!xml) continue;

    for (const location of sitemapLocations(xml)) {
      if (/\.xml(?:$|\?)/i.test(location)) {
        if (/product|post-type|sitemap/i.test(location) && !visited.has(location)) sitemapQueue.push(location);
      } else if (rootLevelCandidate(location, base)) {
        candidates.add(location);
      }
      if (candidates.size >= MAX_CANDIDATES) break;
    }
  }

  return [...candidates].slice(0, MAX_CANDIDATES);
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
      // WordPress pages often contain multiple JSON-LD blocks; keep checking.
    }
  }
  return null;
}

function metaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return stripHtml(match[1]);
  }
  return "";
}

function titleFromDocument(html: string) {
  const ogTitle = metaContent(html, "og:title");
  const titleTag = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const heading = stripHtml(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  const raw = heading || ogTitle || titleTag;
  return raw.replace(/^Homage Year\s*[—|:-]\s*/i, "").trim();
}

function normalizeDocument(html: string, sourceUrl: string): ImportedProduct | null {
  const documentText = stripHtml(html);
  const title = titleFromDocument(html);
  const priceMatch = documentText.match(/\bUSD\s*\$?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i)
    ?? documentText.match(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/);
  const price = asMoney(priceMatch?.[1]);
  if (!title || !price) return null;

  const image = metaContent(html, "og:image");
  const description = metaContent(html, "og:description") || metaContent(html, "description");
  const path = new URL(sourceUrl).pathname.split("/").filter(Boolean);
  const handle = (path[path.length - 1] || title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const available = /ready to ship|add to cart|in stock/i.test(documentText)
    && !/sold out|out of stock/i.test(documentText);
  const externalId = handle;
  const variant: ImportedVariant = { externalId, title: "", price, available };

  return {
    externalId,
    handle,
    title,
    description,
    sourceUrl,
    price,
    stockStatus: available ? "in_stock" : "sold_out",
    isPreorder: /pre[ -]?order/i.test(documentText),
    category: /bag|purse|tote|handbag|shoulder|crossbody/i.test(`${title} ${description}`) ? "Accessories" : "Other",
    tags: ["streetwear", "accessories"],
    images: image ? [image] : [],
    colors: [],
    sizes: [],
    variants: [variant],
  };
}

function normalizeJsonLd(raw: Record<string, unknown>, sourceUrl: string): ImportedProduct | null {
  const title = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!title) return null;
  const offersRaw = raw.offers;
  const offers = (Array.isArray(offersRaw) ? offersRaw : offersRaw ? [offersRaw] : []) as JsonLdOffer[];
  const prices = offers.map((offer) => asMoney(offer.price ?? offer.lowPrice)).filter((price) => price > 0);
  const price = prices.length ? Math.min(...prices) : 0;
  if (!price) return null;
  const available = offers.some((offer) => /InStock|PreOrder|LimitedAvailability/i.test(String(offer.availability ?? "")));
  const description = stripHtml(typeof raw.description === "string" ? raw.description : "");
  const imageRaw = Array.isArray(raw.image) ? raw.image : raw.image ? [raw.image] : [];
  const images = imageRaw
    .map((image) => typeof image === "string" ? image : (image as { url?: string; contentUrl?: string })?.url ?? (image as { contentUrl?: string })?.contentUrl)
    .filter((image): image is string => Boolean(image))
    .slice(0, 10);
  const path = new URL(sourceUrl).pathname.split("/").filter(Boolean);
  const handle = (path[path.length - 1] || title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const externalId = typeof raw.sku === "string" && raw.sku ? raw.sku : offers.find((offer) => offer.sku)?.sku ?? handle;
  const variant: ImportedVariant = { externalId, title: "", price, available };

  return {
    externalId,
    handle,
    title,
    description,
    sourceUrl,
    price,
    stockStatus: available ? "in_stock" : "sold_out",
    isPreorder: offers.some((offer) => /PreOrder/i.test(String(offer.availability ?? ""))),
    category: /bag|purse|tote|handbag|shoulder|crossbody/i.test(`${title} ${description}`) ? "Accessories" : "Other",
    tags: ["streetwear", "accessories"],
    images,
    colors: [],
    sizes: [],
    variants: [variant],
  };
}

async function importHomageStyleCatalog(brand: StreetBrand) {
  const base = brand.storeUrl.replace(/\/$/, "");
  const urls = await candidateUrls(base);
  const products: ImportedProduct[] = [];

  for (let index = 0; index < urls.length; index += 6) {
    const batch = urls.slice(index, index + 6);
    const imported = await Promise.all(batch.map(async (url) => {
      const html = await fetchText(url);
      if (!html) return null;
      const jsonLd = productJsonLd(html);
      return (jsonLd ? normalizeJsonLd(jsonLd, url) : null) ?? normalizeDocument(html, url);
    }));
    products.push(...imported.filter((product): product is ImportedProduct => product !== null));
  }

  return products;
}

export async function importBrandCatalog(brand: StreetBrand): Promise<ImportedProduct[]> {
  const existing = await importDefaultBrandCatalog(brand);
  if (existing.length) return existing;
  return importHomageStyleCatalog(brand);
}
