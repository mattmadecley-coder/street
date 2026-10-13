import { hasSupabaseCatalog, supabaseRest, supabaseRestAll } from "@/lib/supabase-rest";

export type SiteEventType = string;

export type SiteEventInput = {
  eventType: SiteEventType;
  eventId?: string;
  anonymousUserId?: string;
  sessionId?: string;
  eventSequence?: number;
  query?: string;
  resultsCount?: number;
  productId?: string;
  brandSlug?: string;
  streetGroup?: string;
  streetCategory?: string;
  price?: number;
  path?: string;
  referrer?: string | null;
  sourceComponent?: string;
  position?: number;
  deviceType?: string;
  browser?: string;
  operatingSystem?: string;
  screenWidth?: number;
  language?: string;
  timezone?: string;
  landingPath?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  metadata?: Record<string, unknown>;
};

export async function logSiteEvent(input: SiteEventInput) {
  if (!hasSupabaseCatalog() || !input.anonymousUserId?.trim() || !input.sessionId?.trim()) return;
  try {
    await supabaseRest("site_events", {
      method: "POST",
      body: {
        event_type: input.eventType,
        event_id: input.eventId ?? undefined,
        anonymous_user_id: input.anonymousUserId,
        session_id: input.sessionId,
        event_sequence: input.eventSequence ?? null,
        query: input.query ?? null,
        results_count: input.resultsCount ?? null,
        product_id: input.productId ?? null,
        brand_slug: input.brandSlug ?? null,
        street_group: input.streetGroup ?? null,
        street_category: input.streetCategory ?? null,
        price: input.price ?? null,
        path: input.path ?? null,
        referrer: input.referrer ?? null,
        source_component: input.sourceComponent ?? null,
        position: input.position ?? null,
        device_type: input.deviceType ?? null,
        browser: input.browser ?? null,
        operating_system: input.operatingSystem ?? null,
        screen_width: input.screenWidth ?? null,
        language: input.language ?? null,
        timezone: input.timezone ?? null,
        landing_path: input.landingPath ?? null,
        utm_source: input.utmSource ?? null,
        utm_medium: input.utmMedium ?? null,
        utm_campaign: input.utmCampaign ?? null,
        utm_content: input.utmContent ?? null,
        utm_term: input.utmTerm ?? null,
        metadata: input.metadata ?? {},
      },
      prefer: "return=minimal",
    });
  } catch (error) {
    console.error("Street site event logging failed", error);
  }
}

export type SiteEventRow = {
  event_type: SiteEventType;
  anonymous_user_id: string | null;
  session_id: string | null;
  query: string | null;
  results_count: number | null;
  product_id: string | null;
  brand_slug: string | null;
  street_group: string | null;
  street_category: string | null;
  price: number | string | null;
  path: string | null;
  referrer: string | null;
  source_component: string | null;
  position: number | null;
  device_type: string | null;
  browser: string | null;
  operating_system: string | null;
  screen_width: number | null;
  language: string | null;
  timezone: string | null;
  landing_path: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type OutboundClickRow = {
  product_id: string | null;
  brand_slug: string;
  product_slug: string | null;
  product_title: string | null;
  product_price: number | string | null;
  destination_url: string;
  anonymous_user_id: string | null;
  session_id: string | null;
  source_component: string | null;
  source_path: string | null;
  search_query: string | null;
  position: number | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: string;
};

/**
 * Hard ceiling on raw rows pulled into memory per query. Newest rows win, so
 * hitting it silently drops the OLDEST events in a long range. Callers that
 * show totals should check `ANALYTICS_ROW_CAP` against the row count and warn
 * (see getAnalyticsRows). A SQL-aggregate rebuild removes this limit.
 */
export const ANALYTICS_ROW_CAP = 50000;
const MAX_RAW_ANALYTICS_ROWS = ANALYTICS_ROW_CAP;

/**
 * `since` cutoffs computed from `Date.now()` to the millisecond mean every
 * request builds a unique Supabase REST URL, so Next's fetch cache (see
 * supabaseRest's `next.revalidate`) never gets a hit even though these are
 * idempotent reads on GET requests -- every page load is a fully live pull.
 * Rounding down to a shared window lets repeated loads within that window
 * (a person clicking between analytics pages, a second admin tab, a stray
 * refresh) reuse the same cached response instead of re-scanning the table.
 * A 5-minute window is a small enough lag for a single-operator dashboard.
 */
export function cacheFriendlySince(days: number, windowMs = 5 * 60 * 1000): string {
  const raw = Date.now() - days * 86400000;
  const rounded = Math.floor(raw / windowMs) * windowMs;
  return new Date(rounded).toISOString();
}

function safeAnalyticsLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_RAW_ANALYTICS_ROWS;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_RAW_ANALYTICS_ROWS);
}

export async function getRecentSiteEvents(limit = 5000, since?: string, brandSlug?: string): Promise<SiteEventRow[]> {
  if (!hasSupabaseCatalog()) return [];
  try {
    const safeLimit = safeAnalyticsLimit(limit);
    const dateFilter = since ? `&created_at=gte.${encodeURIComponent(since)}` : "";
    // Filtering by brand here (rather than pulling every brand's events and
    // filtering in memory) matters for more than just speed: the row cap
    // above is shared across every brand, so an unfiltered pull can crowd a
    // smaller brand's events out of the window entirely and undercount it.
    const brandFilter = brandSlug ? `&brand_slug=eq.${encodeURIComponent(brandSlug)}` : "";
    // Cap via supabaseRestAll's own maxItems (a client-side stop once
    // enough rows are in hand), not an embedded PostgREST `limit=` query
    // param. Combining a `limit` query param with supabaseRestAll's
    // Range-header pagination broke silently once the real row count
    // (any day with meaningful traffic routinely passed 5000) exceeded
    // that limit: the loop kept requesting further Range-header pages
    // past what `limit` allowed, and PostgREST rejected the resulting
    // request with "Requested range not satisfiable -- Limit should be
    // greater than or equal to zero". That error was caught here and
    // swallowed into an empty array, so the whole admin analytics
    // dashboard quietly showed zeros any time a window's true event count
    // passed the limit -- which was most of the time, since the site sees
    // well over 5000 events in a normal 30-day window.
    return await supabaseRestAll<SiteEventRow[]>(`site_events?select=event_type,anonymous_user_id,session_id,query,results_count,product_id,brand_slug,street_group,street_category,price,path,referrer,source_component,position,device_type,browser,operating_system,screen_width,language,timezone,landing_path,utm_source,utm_medium,utm_campaign,metadata,created_at${dateFilter}${brandFilter}&excluded=is.false&order=created_at.desc`, 1000, safeLimit);
  } catch (error) {
    console.error("Street analytics read failed", error);
    return [];
  }
}

export async function getRecentOutboundClicks(limit = 5000, since?: string, brandSlug?: string): Promise<OutboundClickRow[]> {
  if (!hasSupabaseCatalog()) return [];
  try {
    const safeLimit = safeAnalyticsLimit(limit);
    const dateFilter = since ? `&created_at=gte.${encodeURIComponent(since)}` : "";
    const brandFilter = brandSlug ? `&brand_slug=eq.${encodeURIComponent(brandSlug)}` : "";
    // See getRecentSiteEvents above for why maxItems (not an embedded
    // `limit=` query param) is the right way to cap this.
    return await supabaseRestAll<OutboundClickRow[]>(`outbound_clicks?select=product_id,brand_slug,product_slug,product_title,product_price,destination_url,anonymous_user_id,session_id,source_component,source_path,search_query,position,referrer,utm_source,utm_medium,utm_campaign,created_at${dateFilter}${brandFilter}&excluded=is.false&order=created_at.desc`, 1000, safeLimit);
  } catch (error) {
    console.error("Street outbound click read failed", error);
    return [];
  }
}

/** Events and outbound clicks since a cutoff, plus whether the row cap clipped the oldest rows. */
export async function getAnalyticsRows(sinceIso: string): Promise<{ events: SiteEventRow[]; clicks: OutboundClickRow[]; truncated: boolean }> {
  const [events, clicks] = await Promise.all([
    getRecentSiteEvents(ANALYTICS_ROW_CAP, sinceIso),
    getRecentOutboundClicks(ANALYTICS_ROW_CAP, sinceIso),
  ]);
  return { events, clicks, truncated: events.length >= ANALYTICS_ROW_CAP || clicks.length >= ANALYTICS_ROW_CAP };
}

let earliestCache: { at: number; value: number | null } | null = null;

/** Timestamp of the very first tracked event (cached 10 minutes), used to explain "No prior data". */
export async function getEarliestEventMs(): Promise<number | null> {
  if (earliestCache && Date.now() - earliestCache.at < 600_000) return earliestCache.value;
  if (!hasSupabaseCatalog()) return null;
  try {
    const rows = await supabaseRest<Array<{ created_at: string }>>("site_events?select=created_at&order=created_at.asc&limit=1", { noStore: true });
    const value = rows[0] ? new Date(rows[0].created_at).getTime() : null;
    earliestCache = { at: Date.now(), value: Number.isFinite(value as number) ? value : null };
    return earliestCache.value;
  } catch {
    return null;
  }
}

/** Like getAnalyticsRows, but filtered to one brand server-side so a busy brand cannot crowd a small one out of the row cap. */
export async function getAnalyticsRowsForBrand(brandSlug: string, sinceIso: string): Promise<{ events: SiteEventRow[]; clicks: OutboundClickRow[]; truncated: boolean }> {
  const [events, clicks] = await Promise.all([
    getRecentSiteEvents(ANALYTICS_ROW_CAP, sinceIso, brandSlug),
    getRecentOutboundClicks(ANALYTICS_ROW_CAP, sinceIso, brandSlug),
  ]);
  return { events, clicks, truncated: events.length >= ANALYTICS_ROW_CAP || clicks.length >= ANALYTICS_ROW_CAP };
}
