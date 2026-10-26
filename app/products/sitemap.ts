import type { MetadataRoute } from "next";
import { getAllProductSitemapEntries } from "@/lib/catalog-store";
import { PRODUCTS_PER_SITEMAP, productSitemapChunkCount } from "@/lib/sitemap-config";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Keep this in step with the ISR window on catalog/product pages so the
// sitemap doesn't drift far from what's actually indexable.
export const revalidate = 3600;

export async function generateSitemaps() {
  const products = await getAllProductSitemapEntries();
  return Array.from({ length: productSitemapChunkCount(products.length) }, (_, id) => ({ id }));
}

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const chunkIndex = Number(await id);
  const products = await getAllProductSitemapEntries();
  const start = chunkIndex * PRODUCTS_PER_SITEMAP;

  return products.slice(start, start + PRODUCTS_PER_SITEMAP).map((product) => ({
    url: `${siteUrl}/products/${product.slug}`,
    lastModified: product.lastSyncedAt,
    changeFrequency: "daily",
    priority: 0.7,
  }));
}
