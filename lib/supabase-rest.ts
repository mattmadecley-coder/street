type SupabaseConfig = { url: string; serviceKey: string };

type RestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  prefer?: string;
  range?: { from: number; to: number };
};

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

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method: options.method ?? "GET",
    headers: headers(config, options),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(responseError(data, response.status));
  return data as T;
}

export async function supabaseRestPage<T>(path: string, range: { from: number; to: number }): Promise<{ data: T[]; total: number }> {
  const config = getConfig();
  if (!config) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

  const options: RestOptions = { range };
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    headers: headers(config, options, true),
    cache: "no-store",
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
