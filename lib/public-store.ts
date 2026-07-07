export type PublicProduct = {
  id: number | string;
  title: string;
  handle: string;
  description?: string;
  body_html?: string;
  type?: string;
  product_type?: string;
  tags: string[] | string;
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
  images: string[];
};

const headers = {
  Accept: "application/json, text/html, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (compatible; StreetCatalog/1.0)",
};

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
        return JSON.parse(await response.text()) as PublicProduct;
      }),
    );

    return results.filter((product): product is PublicProduct => product !== null);
  } catch (error) {
    console.error("Street collection-page import failed", error);
    return [];
  }
}
