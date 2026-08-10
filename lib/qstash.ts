import { Client } from "@upstash/qstash";

let client: Client | null = null;

export function hasQStash() {
  return Boolean(process.env.QSTASH_TOKEN);
}

function getClient(): Client {
  if (!client) {
    const token = process.env.QSTASH_TOKEN;
    if (!token) throw new Error("QStash is not configured. Add QSTASH_TOKEN.");
    client = new Client({ token });
  }
  return client;
}

/**
 * Production domain Vercel assigns this project — stable across deploys, no
 * manual config needed. Falls back to NEXT_PUBLIC_SITE_URL for local dev or
 * if the system var is ever unavailable.
 */
export function resolveBaseUrl(): string | null {
  const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.NEXT_PUBLIC_SITE_URL?.replace(/^https?:\/\//, "");
  return domain ? `https://${domain.replace(/\/$/, "")}` : null;
}

/**
 * Queues one brand's catalog sync as its own QStash job. Each job gets a
 * fresh serverless invocation with its own 60s budget, instead of every
 * brand competing for time inside a single cron run (see
 * app/api/cron/catalog, which dispatches, and app/api/qstash/sync-brand,
 * which does the actual work). QStash retries failed deliveries on its own,
 * so a brand whose storefront is briefly down gets retried automatically
 * instead of just being skipped for the day.
 */
export async function enqueueBrandSync(slug: string) {
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) throw new Error("No base URL available (VERCEL_PROJECT_PRODUCTION_URL / NEXT_PUBLIC_SITE_URL both unset).");
  return getClient().publishJSON({
    url: `${baseUrl}/api/qstash/sync-brand`,
    body: { slug },
    retries: 3,
  });
}
