import type { StreetBrand } from "@/lib/brands";

export type BrandMetadata = { logoUrl: string | null; instagramUrl: string | null };

const headers = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "User-Agent": "Mozilla/5.0 (compatible; StreetCatalog/1.0)",
};

function unescapeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&#47;/g, "/");
}

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*[\"']([^\"']+)[\"']`, "i"));
  return match ? unescapeHtml(match[1]) : null;
}

function absoluteUrl(value: string | null, baseUrl: string) {
  if (!value || value.startsWith("data:")) return null;
  try {
    return new URL(value.replace(/\\u0026/g, "&"), baseUrl).toString();
  } catch {
    return null;
  }
}

function extractInstagram(html: string) {
  const match = html.match(/https?:\\/\\/(?:www\\.)?instagram\\.com\\/[A-Za-z0-9._-]+(?:\\/)?/i)
    ?? html.match(/(?:www\\.)?instagram\\.com\\/[A-Za-z0-9._-]+(?:\\/)?/i);
  if (!match) return null;
  const url = match[0].startsWith("http") ? match[0] : `https://${match[0]}`;
  return url.replace(/[\"'<>),;]+$/g, "");
}

function extractHeaderLogo(html: string, brand: StreetBrand) {
  const header = html.match(/<header\\b[\\s\\S]*?<\\/header>/i)?.[0] ?? html;
  const imgTags = header.match(/<img\\b[^>]*>/gi) ?? [];
  const normalizedName = brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const candidates = imgTags.map((tag) => {
    const src = attribute(tag, "src") ?? attribute(tag, "data-src") ?? attribute(tag, "data-lazy-src");
    const alt = attribute(tag, "alt")?.toLowerCase() ?? "";
    const className = attribute(tag, "class")?.toLowerCase() ?? "";
    const id = attribute(tag, "id")?.toLowerCase() ?? "";
    const source = src?.toLowerCase() ?? "";
    let score = 0;
    if (/logo|wordmark|site-brand|header__heading-logo/.test(`${alt} ${className} ${id}`)) score += 12;
    if (alt.includes(normalizedName)) score += 8;
    if (/logo|wordmark/.test(source)) score += 5;
    if (/shopify/.test(source)) score += 1;
    return { url: absoluteUrl(src, brand.storeUrl), score };
  }).filter((candidate): candidate is { url: string; score: number } => Boolean(candidate.url));
  return candidates.sort((a, b) => b.score - a.score)[0]?.url ?? null;
}

export async function fetchBrandMetadata(brand: StreetBrand): Promise<BrandMetadata> {
  try {
    const response = await fetch(brand.storeUrl, { cache: "no-store", headers });
    if (!response.ok) return { logoUrl: null, instagramUrl: null };
    const html = await response.text();
    return { logoUrl: extractHeaderLogo(html, brand), instagramUrl: extractInstagram(html) };
  } catch {
    return { logoUrl: null, instagramUrl: null };
  }
}
