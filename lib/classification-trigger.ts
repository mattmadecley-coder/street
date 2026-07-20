function siteOrigin(): string | null {
  // Internal worker chaining should use the current Vercel deployment directly.
  // This avoids custom-domain DNS, Cloudflare, www/non-www redirects, and the
  // fact that Vercel cron requests treat redirects as final responses.
  const vercelHost = process.env.VERCEL_URL?.trim() || process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelHost) {
    return `https://${vercelHost.replace(/^https?:\/\//i, "").replace(/\/$/, "")}`;
  }

  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!explicit) return null;
  try {
    return new URL(explicit).origin;
  } catch {
    return null;
  }
}

/**
 * Starts one classifier-drain invocation. The classify route returns immediately
 * and performs one bounded batch through Next.js `after()`. A completed full
 * batch starts another invocation until the global queue is empty.
 */
export async function triggerClassificationDrain(brandSlug?: string): Promise<boolean> {
  const origin = siteOrigin();
  if (!origin) return false;

  const url = new URL("/api/cron/classify", origin);
  if (brandSlug) url.searchParams.set("brand", brandSlug);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = process.env.CRON_SECRET;
  if (secret) headers.Authorization = `Bearer ${secret}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    cache: "no-store",
    redirect: "error",
    body: "{}",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Unable to start classification drain (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }

  return true;
}
