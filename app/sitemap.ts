import type { MetadataRoute } from "next";
import { getBrandDirectory } from "@/lib/catalog-store";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Keep this in step with the ISR window on catalog/product pages so the
// sitemap doesn't drift far from what's actually indexable.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/catalog`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${siteUrl}/brands`, changeFrequency: "daily", priority: 0.6 },
    { url: `${siteUrl}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${siteUrl}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];

  // Every brand with at least one live product gets a filtered-catalog URL
  // — a brand still importing (or one Street can't scrape yet) has nothing
  // to index, so it's left out rather than pointing crawlers at an empty
  // page.
  const brands = await getBrandDirectory();
  const brandRoutes: MetadataRoute.Sitemap = brands
    .filter((brand) => brand.productCount > 0)
    .map((brand) => ({
      url: `${siteUrl}/brands/${brand.slug}`,
      changeFrequency: "daily",
      priority: 0.5,
    }));

  // Product detail pages live in their own chunked sitemap
  // (app/products/sitemap.ts, via generateSitemaps()) since there are far
  // more of them than fit under Google's 50k-per-file limit; they're listed
  // individually in robots.ts since Next doesn't auto-generate an index
  // linking the chunks back to this file.
  return [...staticRoutes, ...brandRoutes];
}
