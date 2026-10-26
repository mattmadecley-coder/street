// Shared between app/products/sitemap.ts (which generates the chunked
// product sitemaps) and app/robots.ts (which needs to list every chunk's
// URL, since Next's generateSitemaps() only serves /products/sitemap/[id].xml
// per chunk — there's no automatic sitemap-index file linking them together).

// Google's per-sitemap limit is 50k URLs; stay well under it so the catalog
// can keep growing for a while before the chunk count needs to increase.
export const PRODUCTS_PER_SITEMAP = 10000;

export function productSitemapChunkCount(totalProducts: number): number {
  return Math.max(1, Math.ceil(totalProducts / PRODUCTS_PER_SITEMAP));
}
