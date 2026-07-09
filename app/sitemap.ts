import type { MetadataRoute } from "next";
import { getStoredCatalog, getBrandDirectory } from "@/lib/catalog-store";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Keep this in step with the ISR window on catalog/product pages so the
// sitemap doesn't drift far from what's actually indexable.
export const revalidate = 3600;

// Google's per-sitemap limit is 50k URLs; cap well below that so this stays
// a single file for now instead of needing generateSitemaps().
const MAX_PRODUCT_URLS = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/catalog`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${siteUrl}/brands`, changeFrequency: "daily", priority: 0.6 },
  ];

  // Every brand with at least one live product gets a filtered-catalog URL
  // — a brand still importing (or one Street can't scrape yet) has nothing
  // to index, so it's left out rather than pointing crawlers at an empty
  // page.
  const brands = await getBrandDirectory();
  const brandRoutes: MetadataRoute.Sitemap = brands
    .filter((brand) => brand.productCount > 0)
    .map((brand) => ({
      url: `${siteUrl}/catalog?brand=${brand.slug}`,
      changeFrequency: "daily",
      priority: 0.5,
    }));

  // Product detail pages are how shoppers land on Street from a Google search
  // for a specific item, so they matter most for the discovery goal.
  const products = await getStoredCatalog();
  const productRoutes: MetadataRoute.Sitemap = (products ?? []).slice(0, MAX_PRODUCT_URLS).map((product) => ({
    url: `${siteUrl}/products/${product.slug}`,
    lastModified: product.lastSyncedAt,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  return [...staticRoutes, ...brandRoutes, ...productRoutes];
}
