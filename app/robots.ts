import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Crawlers were spidering the full combinatorial space of catalog filters
// (color x size x price x sort x page, etc.) — each combination triggers a
// fresh Supabase read, and none of these produce pages worth indexing.
// Taxonomy params (brand/group/category/type/detail) are left crawlable
// since those are real, finite landing pages worth indexing.
const NON_INDEXABLE_CATALOG_PARAMS = ["q", "color", "size", "min", "max", "sort", "availability", "page"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: NON_INDEXABLE_CATALOG_PARAMS.map((param) => `/catalog?*${param}=*`),
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
