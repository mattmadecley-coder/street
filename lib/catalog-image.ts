const SHOPIFY_CDN_HOSTS = new Set(["cdn.shopify.com", "cdn.shopifycdn.net"]);

function isShopifyCdnHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return SHOPIFY_CDN_HOSTS.has(normalized) || normalized.endsWith(".shopifycdn.net");
}

// Self-hosted imgproxy instance (img.streetdotcom.com, running on street's own
// VPS) resizes + converts to WebP any catalog image on the fly. This replaced
// ImageKit's free "Web proxy" after that account hit its bandwidth quota --
// see migration notes. It's locked down via IMGPROXY_ALLOWED_SOURCES on the
// proxy itself to a fixed list of known non-Shopify brand hostnames, so a
// newly added brand on a host that isn't on that list falls through to the
// raw-original candidate below until the allowlist is updated for it.
// NEXT_PUBLIC_IMAGE_PROXY_URL is safe to expose client-side -- it's a public
// delivery URL, not a secret (the proxy runs unsigned/"insecure" mode, which
// is why the source-host allowlist is what actually guards it).
const IMAGE_PROXY_URL_ENDPOINT = process.env.NEXT_PUBLIC_IMAGE_PROXY_URL?.replace(/\/+$/, "");

function base64UrlEncode(value: string): string {
  const base64 = typeof Buffer !== "undefined" ? Buffer.from(value, "utf-8").toString("base64") : btoa(value);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Self-hosted imgproxy URL requesting 2x the layout width (retina headroom), resized to fit and converted to WebP, or null if the proxy isn't configured. */
function imageProxyUrl(source: string, widthHint: number): string | null {
  if (!IMAGE_PROXY_URL_ENDPOINT) return null;
  const width = Math.min(3200, Math.max(64, Math.round((Number.isFinite(widthHint) && widthHint > 0 ? widthHint : 400) * 2)));
  return `${IMAGE_PROXY_URL_ENDPOINT}/insecure/rs:fit:${width}:0:0/${base64UrlEncode(source)}.webp`;
}

/**
 * Build direct browser-loadable image candidates for catalog media.
 *
 * Shopify already resizes and auto-negotiates WebP/AVIF for free on its own
 * CDN (confirmed by inspecting real response headers), so for a Shopify host
 * that resize is tried first -- skipping a live imgproxy request there just
 * pays a round trip for no benefit. The self-hosted proxy is still tried
 * afterward as a fallback, and stays the *first* candidate for every
 * non-Shopify host, since those origins serve raw, unresized files on their
 * own and the proxy is the only optimization available for them (subject to
 * its own source-host allowlist -- see imageProxyUrl above). The original
 * URL is always the last resort, so a host the proxy doesn't allow yet, or
 * an unconfigured endpoint, still falls all the way back to exactly what
 * Street served before any resizing proxy was added.
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

    const imageProxy = imageProxyUrl(normalized, widthHint);

    if (shopify) {
      if (shopifyResized) candidates.push(shopifyResized);
      if (imageProxy) candidates.push(imageProxy);
    } else {
      if (imageProxy) candidates.push(imageProxy);
    }

    candidates.push(normalized);
    return [...new Set(candidates)];
  } catch {
    // Relative/local paths and unusual but valid image strings should still be
    // handed to Next/Image unchanged.
    return [trimmed];
  }
}
