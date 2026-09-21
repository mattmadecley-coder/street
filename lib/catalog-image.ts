const SHOPIFY_CDN_HOSTS = new Set(["cdn.shopify.com", "cdn.shopifycdn.net"]);

function isShopifyCdnHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return SHOPIFY_CDN_HOSTS.has(normalized) || normalized.endsWith(".shopifycdn.net");
}

/**
 * Build direct browser-loadable image candidates for catalog media.
 *
 * Shopify's CDN can resize an image with a width query parameter, so Street can
 * ask Shopify for a source asset that's already close to the right size instead
 * of always pulling the full original through the network. We deliberately ask
 * for 2x the layout width hint (not 1x) so Next's own image optimizer -
 * running server-side on Render, not a per-image billed endpoint - has enough
 * source resolution to serve genuinely sharp images on high-DPI/retina
 * screens once it re-encodes and resizes per device. The original URL remains
 * a fallback candidate in case a particular Shopify asset rejects the resize
 * parameter.
 */
export function catalogImageCandidates(source: string, widthHint: number): string[] {
  const trimmed = source.trim();
  if (!trimmed) return [];

  try {
    const original = new URL(trimmed);
    const shopify = isShopifyCdnHost(original.hostname);

    // Shopify supports HTTPS; upgrade stale imported Shopify URLs so secure
    // storefront pages never create mixed-content requests.
    if (shopify && original.protocol === "http:") original.protocol = "https:";

    const normalized = original.toString();
    if (!shopify || !Number.isFinite(widthHint) || widthHint <= 0) return [normalized];

    const resized = new URL(normalized);
    const retinaWidth = Math.round(widthHint) * 2;
    resized.searchParams.set("width", String(Math.min(2400, Math.max(64, retinaWidth))));
    const resizedUrl = resized.toString();
    return resizedUrl === normalized ? [normalized] : [resizedUrl, normalized];
  } catch {
    // Relative/local paths and unusual but valid image strings should still be
    // handed to Next/Image unchanged.
    return [trimmed];
  }
}
