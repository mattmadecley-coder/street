import type { MetadataRoute } from "next";
import { getAllProductSitemapEntries } from "@/lib/catalog-store";
import { productSitemapChunkCount } from "@/lib/sitemap-config";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Keep this in step with app/products/sitemap.ts's own revalidate window.
export const revalidate = 3600;

// Crawlers were spidering the full combinatorial space of catalog filters
// (color x size x price x sort x page, etc.) — each combination triggers a
// fresh Supabase read, and none of these produce pages worth indexing.
// Taxonomy params (brand/group/category/type/detail) are left crawlable
// since those are real, finite landing pages worth indexing.
const NON_INDEXABLE_CATALOG_PARAMS = ["q", "color", "size", "min", "max", "sort", "availability", "page"];

export default async function robots(): Promise<MetadataRoute.Robots> {
  // app/products/sitemap.ts uses generateSitemaps() to split products across
  // /products/sitemap/0.xml, /products/sitemap/1.xml, etc. (one file per
  // chunk, Google's 50k-per-file limit) — Next doesn't generate an index
  // file linking them, so every chunk needs its own line here for crawlers
  // to find them all.
  const products = await getAllProductSitemapEntries();
  const productSitemaps = Array.from(
    { length: productSitemapChunkCount(products.length) },
    (_, id) => `${siteUrl}/products/sitemap/${id}.xml`
  );

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: NON_INDEXABLE_CATALOG_PARAMS.map((param) => `/catalog?*${param}=*`),
    },
    sitemap: [`${siteUrl}/sitemap.xml`, ...productSitemaps],
  };
}
