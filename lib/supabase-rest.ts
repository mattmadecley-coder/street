type SupabaseConfig = { url: string; serviceKey: string };

type RestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  prefer?: string;
  range?: { from: number; to: number };
  /** Bypass the shared catalog cache for reads that must see the latest write (e.g. sync bookkeeping). */
  noStore?: boolean;
  /** Override the normal one-hour catalog cache for time-sensitive reads. */
  revalidateSeconds?: number;
};

/**
 * Tag applied to every cached catalog read. The daily cron sync calls
 * `revalidateTag(CATALOG_CACHE_TAG)` as soon as it finishes writing, so pages
 * refresh immediately after new data lands instead of waiting out the TTL below.
 */
export const CATALOG_CACHE_TAG = "street-catalog";
export const CATALOG_REVALIDATE_SECONDS = 3600;

type ArrayItem<T> = T extends Array<infer Item> ? Item : T;

function getConfig(): SupabaseConfig | null {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !serviceKey) return null;

  // Accept either the project root URL or a copied Data API URL ending in /rest/v1.
  const url = rawUrl
    .trim()
    .replace(/\/$/, "")
    .replace(/\/rest\/v1$/i, "");

  return { url, serviceKey };
}

export function hasSupabaseCatalog() {
  return Boolean(getConfig());
}

function headers(config: SupabaseConfig, options: RestOptions, count = false) {
  const preferences = [options.prefer ?? "return=representation", ...(count ? ["count=exact"] : [])].join(",");
  return {
    apikey: config.serviceKey,
    Authorization: `Bearer ${config.serviceKey}`,
    "Content-Type": "application/json",
    Prefer: preferences,
    ...(options.range ? { Range: `${options.range.from}-${options.range.to}`, "Range-Unit": "items" } : {}),
  };
}

function responseError(data: unknown, status: number) {
  return typeof data === "object" && data && "message" in data ? String(data.message) : `Supabase request failed (${status})`;
}

export async function supabaseRest<T>(path: string, options: RestOptions = {}): Promise<T> {
  const config = getConfig();
  if (!config) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

  const method = options.method ?? "GET";
  const revalidateSeconds = Number.isFinite(options.revalidateSeconds)
    ? Math.max(0, Number(options.revalidateSeconds))
    : CATALOG_REVALIDATE_SECONDS;
  // Only idempotent reads are safe to cache. Writes (and reads explicitly
  // marked noStore, e.g. read-before-upsert checks) always hit Supabase live.
  const cacheInit: Partial<RequestInit> = method === "GET" && !options.noStore
    ? { next: { revalidate: revalidateSeconds, tags: [CATALOG_CACHE_TAG] } }
    : { cache: "no-store" };

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method,
    headers: headers(config, options),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    ...cacheInit,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(responseError(data, response.status));
  return data as T;
}

export async function supabaseRestPage<T>(path: string, range: { from: number; to: number }, restOptions: { noStore?: boolean; revalidateSeconds?: number } = {}): Promise<{ data: T[]; total: number }> {
  const config = getConfig();
  if (!config) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

  const options: RestOptions = { range };
  const revalidateSeconds = Number.isFinite(restOptions.revalidateSeconds)
    ? Math.max(0, Number(restOptions.revalidateSeconds))
    : CATALOG_REVALIDATE_SECONDS;
  const cacheInit: Partial<RequestInit> = restOptions.noStore
    ? { cache: "no-store" }
    : { next: { revalidate: revalidateSeconds, tags: [CATALOG_CACHE_TAG] } };

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    headers: headers(config, options, true),
    ...cacheInit,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(responseError(data, response.status));

  const totalText = response.headers.get("content-range")?.split("/")[1] ?? "0";
  const total = Number(totalText);
  return { data: Array.isArray(data) ? data as T[] : [], total: Number.isFinite(total) ? total : 0 };
}

export async function supabaseRestAll<T>(path: string, pageSize = 500): Promise<ArrayItem<T>[]> {
  const all: ArrayItem<T>[] = [];
  let from = 0;

  while (true) {
    const page = await supabaseRest<ArrayItem<T>[]>(path, { range: { from, to: from + pageSize - 1 } });
    all.push(...page);
    if (page.length < pageSize) return all;
    from += pageSize;
  }
}
