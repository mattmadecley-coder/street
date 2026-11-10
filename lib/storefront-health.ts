const HEALTH_TIMEOUT_MS = 15_000;

const HEALTH_HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent": "Mozilla/5.0 (compatible; StreetStorefrontHealth/1.0)",
};

export type StorefrontHealth = {
  status: "open" | "closed" | "unknown";
  reason?: string;
  checkedUrl?: string;
};

// Headless storefronts (Remix/Next + Shopify Storefront API, rather than a
// classic Liquid theme) commonly embed the full product/collection payload
// as JSON inside a <script> tag for client-side hydration. A product can
// legitimately carry a tag or title like "coming soon" as plain data, which
// has nothing to do with the storefront itself being gated -- but a naive
// substring search over the whole HTML document can't tell the two apart,
// and will misfire on that embedded JSON. Stripping <script>/<style> blocks
// before running the text-marker checks keeps those checks scoped to actual
// rendered page copy, where a real launch-gate message would appear.
function stripNonVisibleBlocks(html: string) {
  return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
}

function hasPasswordInput(html: string) {
  return /<input[^>]+type=["']password["']/i.test(html);
}

function hasStrongPasswordPageMarker(visibleHtml: string) {
  const lower = visibleHtml.toLowerCase();
  return lower.includes("shopify-section-password")
    || lower.includes("template-password")
    || lower.includes("password-page")
    || lower.includes("storefront-password")
    || lower.includes("are you the store owner?")
    || lower.includes("enter store using password")
    || lower.includes("i have a password");
}

function hasClosedLaunchMarker(html: string, visibleHtml: string) {
  const lower = visibleHtml.toLowerCase();
  return hasPasswordInput(html) && (
    lower.includes("opening soon")
    || lower.includes("coming soon")
    || lower.includes("get access early")
    || lower.includes("enter our world")
  );
}

export async function inspectStorefront(storeUrl: string): Promise<StorefrontHealth> {
  const base = storeUrl.replace(/\/$/, "");
  try {
    const response = await fetch(base, {
      cache: "no-store",
      headers: HEALTH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });

    if (!response.ok) return { status: "unknown", reason: `HTTP ${response.status}`, checkedUrl: response.url };
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return { status: "unknown", reason: "Homepage did not return HTML", checkedUrl: response.url };

    const html = await response.text();
    const visibleHtml = stripNonVisibleBlocks(html);
    const finalPath = new URL(response.url).pathname.toLowerCase();
    const redirectedToPassword = finalPath === "/password" || finalPath.startsWith("/password/");
    const explicitPasswordPage = hasPasswordInput(html) && hasStrongPasswordPageMarker(visibleHtml);
    const launchGate = hasClosedLaunchMarker(html, visibleHtml);

    if (redirectedToPassword || explicitPasswordPage || launchGate) {
      return {
        status: "closed",
        reason: redirectedToPassword ? "Redirected to a password page" : "Password-protected or pre-drop storefront detected",
        checkedUrl: response.url,
      };
    }

    return { status: "open", checkedUrl: response.url };
  } catch (error) {
    return {
      status: "unknown",
      reason: error instanceof Error ? error.message : "Storefront health request failed",
    };
  }
}
