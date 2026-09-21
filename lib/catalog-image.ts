const SHOPIFY_CDN_HOSTS = new Set(["cdn.shopify.com", "cdn.shopifycdn.net"]);

function isShopifyCdnHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return SHOPIFY_CDN_HOSTS.has(normalized) || normalized.endsWith(".shopifycdn.net");
}

// ImageKit's free "Web proxy" origin fetches + transforms any publicly
// reachable image URL on the fly: https://ik.imagekit.io/<id>/tr:<params>/<source-url>.
// This is what actually resizes and reformats (AVIF/WebP) every catalog
// image now, for every brand's host, not just Shopify -- Next's own
// optimizer can't do this here because Render's free/starter plan can't
// handle the concurrent transform load a catalog grid produces (see
// components/catalog-image.tsx). NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT is safe
// to expose client-side -- it's a public delivery URL, not a secret.
const IMAGEKIT_URL_ENDPOINT = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT?.replace(/\/+$/, "");

/** ImageKit-proxied URL requesting 2x the layout width (retina headroom) with auto format + quality 80, or null if ImageKit isn't configured. */
function imageKitUrl(source: string, widthHint: number): string | null {
  if (!IMAGEKIT_URL_ENDPOINT) return null;
  const width = Math.min(3200, Math.max(64, Math.round((Number.isFinite(widthHint) && widthHint > 0 ? widthHint : 400) * 2)));
  return `${IMAGEKIT_URL_ENDPOINT}/tr:w-${width},f-auto,q-80/${source}`;
}

/**
 * Build direct browser-loadable image candidates for catalog media.
 *
 * The first candidate routes through ImageKit (see imageKitUrl above) when
 * NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT is configured. Remaining candidates are
 * the old direct-CDN path as a fallback chain: Shopify's own ?width= resize
 * (for Shopify hosts), then the untouched original -- so a broken ImageKit
 * asset, or ImageKit being unconfigured/down, still falls back to exactly
 * what Street served before ImageKit was added.
 */
export function catalogImageCandidates(source: string, widthHint: number): string[] {
  const trimmed = source.trim();
  if (!trimmed) return [];

  try {
    const original = new URL(trimmed);
    const shopify = isShopifyCdnHost(original.hostname);

    // Upgrade stale imported http URLs so secure storefront pages never
    // create mixed-content requests, and so ImageKit always fetches over https.
    if (original.protocol === "http:") original.protocol = "https:";

    const normalized = original.toString();
    const candidates: string[] = [];

    const imageKit = imageKitUrl(normalized, widthHint);
    if (imageKit) candidates.push(imageKit);

    if (shopify && Number.isFinite(widthHint) && widthHint > 0) {
      const resized = new URL(normalized);
      const retinaWidth = Math.round(widthHint) * 2;
      resized.searchParams.set("width", String(Math.min(2400, Math.max(64, retinaWidth))));
      const resizedUrl = resized.toString();
      if (resizedUrl !== normalized) candidates.push(resizedUrl);
    }

    candidates.push(normalized);
    return [...new Set(candidates)];
  } catch {
    // Relative/local paths and unusual but valid image strings should still be
    // handed to Next/Image unchanged.
    return [trimmed];
  }
}
