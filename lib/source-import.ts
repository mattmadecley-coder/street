import type { StreetBrand } from "@/lib/brands";

export type ImportedVariant = {
  externalId: string;
  title: string;
  price: number;
  compareAtPrice?: number;
  available: boolean;
  option1?: string;
  option2?: string;
  option3?: string;
};

export type ImportedProduct = {
  externalId: string;
  handle: string;
  title: string;
  description: string;
  sourceUrl: string;
  price: number;
  compareAtPrice?: number;
  stockStatus: "in_stock" | "sold_out";
  isPreorder: boolean;
  category: string;
  tags: string[];
  images: string[];
  colors: string[];
  sizes: string[];
  variants: ImportedVariant[];
};

type RawVariant = { id: number | string; title?: string; price: number | string; compare_at_price?: number | string | null; available: boolean; option1?: string | null; option2?: string | null; option3?: string | null };
type RawProduct = { id: number | string; title: string; handle: string; body_html?: string | null; description?: string | null; product_type?: string; type?: string; tags?: string | string[]; options?: Array<{ name: string; values: string[] }>; variants?: RawVariant[]; images?: Array<{ src: string; position?: number }> | string[] };

const headers = { Accept: "application/json, text/html, text/plain, */*", "User-Agent": "Mozilla/5.0 (compatible; StreetCatalog/1.0)" };
const colorWords = ["black", "white", "gray", "grey", "blue", "navy", "green", "army", "brown", "tan", "cream", "red", "purple", "yellow", "pink", "camo"];
const cleanText = (value = "") => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const titleCase = (value: string) => value.replace(/\b\w/g, (letter) => letter.toUpperCase());

function price(value: number | string | null | undefined, isCents: boolean) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Number((isCents ? parsed / 100 : parsed).toFixed(2)) : 0;
}

function categoryFor(title: string, productType: string) {
  const value = `${title} ${productType}`.toLowerCase();
  if (/decal|sticker/.test(value)) return "Decals";
  if (/keychain|air freshener|accessor|balaclava|beanie|hat|cap/.test(value)) return "Accessories";
  if (/denim|jean/.test(value)) return "Denim";
  if (/cargo|sweatpant|pants|trouser/.test(value)) return "Pants";
  if (/short/.test(value)) return "Shorts";
  if (/jacket|coat|outerwear/.test(value)) return "Outerwear";
  if (/hoodie|hooded|zip[ -]?up|sweatshirt/.test(value)) return "Hoodies & Sweatshirts";
  if (/tee|t-shirt|t shirt/.test(value)) return "T-Shirts";
  if (/polo|rugby|thermal|shirt/.test(value)) return "Tops";
  return productType ? titleCase(productType) : "Other";
}

function normalizeProduct(raw: RawProduct, brand: StreetBrand, isCents: boolean): ImportedProduct {
  const productType = raw.product_type ?? raw.type ?? "";
  const description = cleanText(raw.body_html ?? raw.description ?? "");
  const tags = Array.isArray(raw.tags) ? raw.tags : (raw.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
  const variants = (raw.variants ?? []).map((variant) => ({
    externalId: String(variant.id),
    title: variant.title ?? [variant.option1, variant.option2, variant.option3].filter(Boolean).join(" / "),
    price: price(variant.price, isCents),
    compareAtPrice: variant.compare_at_price ? price(variant.compare_at_price, isCents) : undefined,
    available: Boolean(variant.available),
    option1: variant.option1 ?? undefined,
    option2: variant.option2 ?? undefined,
    option3: variant.option3 ?? undefined,
  }));
  const options = raw.options ?? [];
  const colorOption = options.find((option) => /color|colour/.test(option.name));
  const sizeOption = options.find((option) => /size/.test(option.name));
  const haystack = `${raw.title} ${productType} ${tags.join(" ")} ${description}`.toLowerCase();
  const colors = colorOption?.values?.length ? colorOption.values : colorWords.filter((item) => haystack.includes(item)).map(titleCase);
  const sizes = sizeOption?.values?.length ? sizeOption.values : [...new Set(variants.flatMap((variant) => [variant.option1, variant.option2, variant.option3]).filter((value): value is string => Boolean(value) && /^(xxs|xs|s|m|l|xl|xxl|\d{2,3})$/i.test(value)))];
  const images = (raw.images ?? []).map((image, index) => {
    const src = typeof image === "string" ? image : image.src;
    return { src: src.startsWith("//") ? `https:${src}` : src, position: typeof image === "string" ? index : image.position ?? index };
  }).sort((a, b) => a.position - b.position).map((image) => image.src);
  const category = categoryFor(raw.title, productType);
  const generatedTags = new Set(["streetwear", category.toLowerCase(), ...tags.map((tag) => tag.toLowerCase()), ...colors.map((color) => color.toLowerCase())]);
  if (/moto|bike|motocross|racing/.test(haystack)) ["moto", "motorcycle", "racing"].forEach((tag) => generatedTags.add(tag));
  if (/baggy|wide/.test(haystack)) ["baggy", "wide leg"].forEach((tag) => generatedTags.add(tag));
  if (/cargo|utility|military|army|infantry/.test(haystack)) ["utility", "workwear", "military"].forEach((tag) => generatedTags.add(tag));
  if (/pre[ -]?order|made to order|made-to-order/.test(haystack)) generatedTags.add("pre-order");
  const firstVariant = variants[0];
  return {
    externalId: String(raw.id),
    handle: raw.handle,
    title: raw.title,
    description,
    sourceUrl: `${brand.storeUrl.replace(/\/$/, "")}/products/${raw.handle}`,
    price: firstVariant?.price ?? 0,
    compareAtPrice: firstVariant?.compareAtPrice,
    stockStatus: variants.some((variant) => variant.available) ? "in_stock" : "sold_out",
    isPreorder: /pre[ -]?order|made to order|made-to-order/.test(haystack),
    category,
    tags: [...generatedTags],
    images,
    colors,
    sizes,
    variants,
  };
}

async function readJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store", headers });
    if (!response.ok) return null;
    return JSON.parse(await response.text()) as T;
  } catch {
    return null;
  }
}

async function readHandles(storeUrl: string) {
  try {
    const response = await fetch(`${storeUrl.replace(/\/$/, "")}/collections/all`, { cache: "no-store", headers });
    if (!response.ok) return [];
    const html = await response.text();
    const handles = new Set<string>();
    for (const match of html.matchAll(/\/products\/([a-z0-9-]+)/gi)) handles.add(match[1]);
    return [...handles].slice(0, 120);
  } catch {
    return [];
  }
}

export async function importBrandCatalog(brand: StreetBrand): Promise<ImportedProduct[]> {
  const base = brand.storeUrl.replace(/\/$/, "");
  const json = await readJson<{ products?: RawProduct[] }>(`${base}/products.json?limit=250`);
  if (json?.products?.length) return json.products.map((product) => normalizeProduct(product, brand, false));

  const handles = await readHandles(base);
  if (!handles.length) return [];
  const products = await Promise.all(handles.map(async (handle) => {
    const product = await readJson<RawProduct>(`${base}/products/${handle}.js`);
    return product ? normalizeProduct(product, brand, true) : null;
  }));
  return products.filter((product): product is ImportedProduct => product !== null);
}
