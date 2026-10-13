import { hasSupabaseCatalog, supabaseRest, supabaseRestPage } from "@/lib/supabase-rest";

/**
 * Products that were given a placeholder category because the AI service could not be reached
 * (out of credits, bad key, outage). The worker tags those with this model name. They are not real
 * classifications, so after the cause is fixed they should simply go through the AI again.
 */
export const FALLBACK_MODEL = "street/broad-fallback-v2";

const FILTER = `classification_model=eq.${encodeURIComponent(FALLBACK_MODEL)}&classification_status=eq.needs_review&is_active=eq.true`;

export async function countFallbackProducts(): Promise<number> {
  if (!hasSupabaseCatalog()) return 0;
  try {
    const { total } = await supabaseRestPage<{ id: string }>(`products?select=id&${FILTER}`, { from: 0, to: 0 }, { noStore: true });
    return total;
  } catch {
    return 0;
  }
}

/** Puts every placeholder-classified product back in the queue. Returns how many were queued. */
export async function requeueFallbackProducts(): Promise<number> {
  const count = await countFallbackProducts();
  if (!count) return 0;
  await supabaseRest(`products?${FILTER}`, {
    method: "PATCH",
    body: { classification_status: "pending", classification_error: null },
    prefer: "return=minimal",
  });
  return count;
}
