import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";

function siteOrigin(): string | null {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      // Fall through to Vercel-provided hostnames.
    }
  }

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (!vercelHost) return null;
  return `https://${vercelHost.replace(/^https?:\/\//i, "").replace(/\/$/, "")}`;
}

/**
 * Starts one classifier-drain invocation. In production, route through the
 * database watchdog because it owns the stable public URL and private trigger
 * token. This avoids deployment protection, self-call aliases, redirects, and
 * other Vercel-to-itself failure modes. Local development falls back to a
 * direct request when Supabase is not configured.
 */
export async function triggerClassificationDrain(): Promise<boolean> {
  if (hasSupabaseCatalog()) {
    const requestId = await supabaseRest<number | null>("rpc/wake_classification_worker", {
      method: "POST",
      body: {},
    });
    return typeof requestId === "number" && requestId > 0;
  }

  const origin = siteOrigin();
  if (!origin) return false;

  const url = new URL("/api/cron/classify", origin);
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
