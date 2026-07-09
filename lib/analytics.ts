import { hasSupabaseCatalog, supabaseRest, supabaseRestAll } from "@/lib/supabase-rest";

export type SiteEventType = "page_view" | "search" | "search_click" | "category_view" | "product_view";

export type SiteEventInput = {
  eventType: SiteEventType;
  query?: string;
  resultsCount?: number;
  productId?: string;
  brandSlug?: string;
  streetGroup?: string;
  streetCategory?: string;
  price?: number;
  path?: string;
  referrer?: string | null;
};

/**
 * Fire-and-forget event log. Never throws — a logging failure should never
 * break the page it's attached to (same rule as lib/outbound-clicks.ts).
 */
export async function logSiteEvent(input: SiteEventInput) {
  if (!hasSupabaseCatalog()) return;
  try {
    await supabaseRest("site_events", {
      method: "POST",
      body: {
        event_type: input.eventType,
        query: input.query ?? null,
        results_count: input.resultsCount ?? null,
        product_id: input.productId ?? null,
        brand_slug: input.brandSlug ?? null,
        street_group: input.streetGroup ?? null,
        street_category: input.streetCategory ?? null,
        price: input.price ?? null,
        path: input.path ?? null,
        referrer: input.referrer ?? null,
      },
      prefer: "return=minimal",
    });
  } catch (error) {
    console.error("Street site event logging failed", error);
  }
}

export type SiteEventRow = {
  event_type: SiteEventType;
  query: string | null;
  results_count: number | null;
  product_id: string | null;
  brand_slug: string | null;
  street_group: string | null;
  street_category: string | null;
  price: number | string | null;
  path: string | null;
  referrer: string | null;
  created_at: string;
};

export type OutboundClickRow = { brand_slug: string; product_slug: string | null; destination_url: string; created_at: string };

/** Recent events for the admin analytics page, aggregated in JS (event volume is low enough that this beats hand-rolling PostgREST group-by via RPC). */
export async function getRecentSiteEvents(limit = 5000): Promise<SiteEventRow[]> {
  if (!hasSupabaseCatalog()) return [];
  try {
    return await supabaseRestAll<SiteEventRow[]>(`site_events?select=event_type,query,results_count,product_id,brand_slug,street_group,street_category,price,path,referrer,created_at&order=created_at.desc&limit=${limit}`, 500);
  } catch (error) {
    console.error("Street analytics read failed", error);
    return [];
  }
}

export async function getRecentOutboundClicks(limit = 5000): Promise<OutboundClickRow[]> {
  if (!hasSupabaseCatalog()) return [];
  try {
    return await supabaseRestAll<OutboundClickRow[]>(`outbound_clicks?select=brand_slug,product_slug,destination_url,created_at&order=created_at.desc&limit=${limit}`, 500);
  } catch (error) {
    console.error("Street outbound click read failed", error);
    return [];
  }
}
