type SupabaseConfig = { url: string; serviceKey: string };

type RestOptions = { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; prefer?: string };

function getConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
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
