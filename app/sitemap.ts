import type { MetadataRoute } from "next";
import { getStoredCatalog } from "@/lib/catalog-store";

// Only brands with an actual app/brands/<slug>/page.tsx belong here — most of
// STREET_BRANDS are catalog-only sources with no dedicated page yet, and
// listing routes that 404 would hurt (not help) discovery SEO.
const BRAND_PAGES = ["seventy-four-uniform", "clutch-supply"];

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

  const brandRoutes: MetadataRoute.Sitemap = BRAND_PAGES.map((slug) => ({
    url: `${siteUrl}/brands/${slug}`,
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
