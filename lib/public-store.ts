export type PublicProduct = {
  id: number | string;
  title: string;
  handle: string;
  body_html: string | null;
  product_type: string;
  tags: string;
  options: Array<{ name: string; values: string[] }>;
  variants: Array<{
    id: number | string;
    price: string;
    compare_at_price: string | null;
    available: boolean;
    option1: string | null;
    option2: string | null;
    option3: string | null;
  }>;
  images: Array<{ src: string; position: number }>;
};

type ProductPageResponse = {
  id: number | string;
  title: string;
  handle: string;
  description?: string;
  type?: string;
  tags?: string[] | string;
  options: Array<{ name: string; values: string[] }>;
  variants: Array<{
    id: number | string;
    price: number | string;
    compare_at_price: number | string | null;
    available: boolean;
    option1: string | null;
    option2: string | null;
    option3: string | null;
  }>;
  images?: string[];
};

const headers = {
  Accept: "application/json, text/html, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (compatible; StreetCatalog/1.0)",
};

function moneyFromCents(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const cents = Number(value);
  return Number.isFinite(cents) ? (cents / 100).toFixed(2) : null;
}

function normalizeProduct(product: ProductPageResponse): PublicProduct {
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    body_html: product.description ?? "",
    product_type: product.type ?? "",
    tags: Array.isArray(product.tags) ? product.tags.join(",") : product.tags ?? "",
    options: product.options ?? [],
    variants: (product.variants ?? []).map((variant) => ({
      id: variant.id,
      // Shopify's public .js route uses cents. Street's catalog mapper expects dollars.
      price: moneyFromCents(variant.price) ?? "0.00",
      compare_at_price: moneyFromCents(variant.compare_at_price),
      available: variant.available,
      option1: variant.option1,
      option2: variant.option2,
      option3: variant.option3,
    })),
    images: (product.images ?? []).map((src, position) => ({
      src: src.startsWith("//") ? `https:${src}` : src,
      position,
    })),
  };
}

export async function fetchPublicProductPages(baseUrl: string): Promise<PublicProduct[]> {
  try {
    const collection = await fetch(`${baseUrl}/collections/all`, { cache: "no-store", headers });
    if (!collection.ok) return [];

    const html = await collection.text();
    const handles = new Set<string>();
    const pattern = /\/products\/([a-z0-9-]+)/gi;
    for (const match of html.matchAll(pattern)) handles.add(match[1]);

    const results = await Promise.all(
      [...handles].slice(0, 60).map(async (handle) => {
        const response = await fetch(`${baseUrl}/products/${handle}.js`, { cache: "no-store", headers });
        if (!response.ok) return null;
        return normalizeProduct(JSON.parse(await response.text()) as ProductPageResponse);
      }),
    );

    return results.filter((product): product is PublicProduct => product !== null);
  } catch (error) {
    console.error("Street collection-page import failed", error);
    return [];
  }
}
