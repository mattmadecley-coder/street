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
export async function importBrandCatalog(brand: StreetBrand): Promise<ImportedProduct[]> { const base = brand.storeUrl.replace(/\/$/, ""); const feed = await json<{ products?: RawProduct[] }>(`${base}/products.json?limit=250`); if (feed?.products?.length) return feed.products.map((product) => normalize(product, brand, false)); const productHandles = await handles(base); const products = await Promise.all(productHandles.map(async (handle) => { const product = await json<RawProduct>(`${base}/products/${handle}.js`); return product ? normalize(product, brand, true) : null; })); return products.filter((product): product is ImportedProduct => product !== null); }
