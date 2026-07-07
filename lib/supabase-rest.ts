type SupabaseConfig = { url: string; serviceKey: string };

type RestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  prefer?: string;
  range?: { from: number; to: number };
};

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

export async function supabaseRest<T>(path: string, options: RestOptions = {}): Promise<T> {
  const config = getConfig();
  if (!config) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": "application/json",
      Prefer: options.prefer ?? "return=representation",
      ...(options.range ? { Range: `${options.range.from}-${options.range.to}`, "Range-Unit": "items" } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = typeof data === "object" && data && "message" in data ? String(data.message) : `Supabase request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

export async function supabaseRestAll<T>(path: string, pageSize = 500): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  while (true) {
    const page = await supabaseRest<T[]>(path, { range: { from, to: from + pageSize - 1 } });
    all.push(...page);
    if (page.length < pageSize) return all;
    from += pageSize;
  }
}
