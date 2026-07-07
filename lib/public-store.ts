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
    price: number | string;
    compare_at_price: number | string | null;
    available: boolean;
    option1: string | null;
    option2: string | null;
    option3: string | null;
  }>;
  images: Array<{ src: string; position: number }>;
};

type ProductPageResponse = Omit<PublicProduct, "body_html" | "product_type" | "tags" | "images"> & {
  description?: string;
  type?: string;
  tags?: string[] | string;
  images?: string[];
};

const headers = {
  Accept: "application/json, text/html, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (compatible; StreetCatalog/1.0)",
};

function normalizeProduct(product: ProductPageResponse): PublicProduct {
  return {
    ...product,
    body_html: product.description ?? "",
    product_type: product.type ?? "",
    tags: Array.isArray(product.tags) ? product.tags.join(",") : product.tags ?? "",
    images: (product.images ?? []).map((src, position) => ({ src: src.startsWith("//") ? `https:${src}` : src, position })),
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
