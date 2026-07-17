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

function hasPasswordInput(html: string) {
  return /<input[^>]+type=["']password["']/i.test(html);
}

function hasStrongPasswordPageMarker(html: string) {
  const lower = html.toLowerCase();
  return lower.includes("shopify-section-password")
    || lower.includes("template-password")
    || lower.includes("password-page")
    || lower.includes("storefront-password")
    || lower.includes("are you the store owner?")
    || lower.includes("enter store using password")
    || lower.includes("i have a password");
}

function hasClosedLaunchMarker(html: string) {
  const lower = html.toLowerCase();
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
    const finalPath = new URL(response.url).pathname.toLowerCase();
    const redirectedToPassword = finalPath === "/password" || finalPath.startsWith("/password/");
    const explicitPasswordPage = hasPasswordInput(html) && hasStrongPasswordPageMarker(html);
    const launchGate = hasClosedLaunchMarker(html);

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
