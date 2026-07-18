function siteOrigin(): string | null {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      // Fall through to Vercel-provided hostnames.
    }
  }

  const vercelHost = process.env.VERCEL_URL?.trim() || process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (!vercelHost) return null;
  return `https://${vercelHost.replace(/^https?:\/\//i, "").replace(/\/$/, "")}`;
}

/**
 * Starts one classifier-drain invocation. The classify route returns immediately
 * and performs work through Next.js `after()`, so callers do not inherit the
 * classifier's serverless runtime. Each invocation schedules another one when
 * a full batch was found, allowing the queue to drain across multiple requests.
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
    body: "{}",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Unable to start classification drain (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }

  return true;
}
