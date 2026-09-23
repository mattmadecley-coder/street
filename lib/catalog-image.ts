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
 * Shopify already resizes and auto-negotiates WebP/AVIF for free on its own
 * CDN (confirmed by inspecting real response headers), so for a Shopify host
 * that resize is tried first -- skipping a live ImageKit request there just
 * pays a round trip (or, whenever ImageKit is over its bandwidth quota, a
 * guaranteed failed one) for no benefit. ImageKit is still tried afterward as
 * a fallback for that rare case, and stays the *first* candidate for every
 * non-Shopify host, since those origins serve raw, unresized files on their
 * own and ImageKit is the only optimization available for them. The original
 * URL is always the last resort, so a broken ImageKit asset or an unconfigured
 * endpoint still falls all the way back to exactly what Street served before
 * ImageKit was added.
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

    const shopifyResized = (() => {
      if (!shopify || !Number.isFinite(widthHint) || widthHint <= 0) return null;
      const resized = new URL(normalized);
      const retinaWidth = Math.round(widthHint) * 2;
      resized.searchParams.set("width", String(Math.min(2400, Math.max(64, retinaWidth))));
      const resizedUrl = resized.toString();
      return resizedUrl !== normalized ? resizedUrl : null;
    })();

    const imageKit = imageKitUrl(normalized, widthHint);

    if (shopify) {
      if (shopifyResized) candidates.push(shopifyResized);
      if (imageKit) candidates.push(imageKit);
    } else {
      if (imageKit) candidates.push(imageKit);
    }

    candidates.push(normalized);
    return [...new Set(candidates)];
  } catch {
    // Relative/local paths and unusual but valid image strings should still be
    // handed to Next/Image unchanged.
    return [trimmed];
  }
}
