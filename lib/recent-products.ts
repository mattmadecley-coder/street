import { cache } from "react";
import { hasSupabaseCatalog, supabaseRestAll } from "@/lib/supabase-rest";

const RECENT_PRODUCT_HOURS = 24;

/**
 * Product IDs first inserted into Street during the recent-product window.
 * React cache ensures a page containing dozens of ProductCards only performs
 * this database read once for the whole server render.
 */
export const getRecentlyAddedProductIds = cache(async (): Promise<Set<string>> => {
  if (!hasSupabaseCatalog()) return new Set();

  const cutoff = new Date(Date.now() - RECENT_PRODUCT_HOURS * 60 * 60_000).toISOString();

  try {
    const rows = await supabaseRestAll<Array<{ id: string }>>(
      `products?select=id&is_active=eq.true&is_hidden=eq.false&created_at=gte.${encodeURIComponent(cutoff)}&order=created_at.desc`
    );
    return new Set(rows.map((row) => row.id));
  } catch (error) {
    console.error("Street recent-product lookup failed", error);
    return new Set();
  }
});

export async function isProductRecentlyAdded(productId: string): Promise<boolean> {
  return (await getRecentlyAddedProductIds()).has(productId);
}
