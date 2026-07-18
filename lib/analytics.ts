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
  if (!hasSupabaseCatalog()) return;
  try {
    await supabaseRest("site_events", {
      method: "POST",
      body: {
        event_type: input.eventType,
        event_id: input.eventId ?? undefined,
        anonymous_user_id: input.anonymousUserId ?? null,
        session_id: input.sessionId ?? null,
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
  landing_path: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type OutboundClickRow = {
  brand_slug: string;
  product_slug: string | null;
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

export async function getRecentSiteEvents(limit = 20000, since?: string): Promise<SiteEventRow[]> {
  if (!hasSupabaseCatalog()) return [];
  try {
    const dateFilter = since ? `&created_at=gte.${encodeURIComponent(since)}` : "";
    return await supabaseRestAll<SiteEventRow[]>(`site_events?select=event_type,anonymous_user_id,session_id,query,results_count,product_id,brand_slug,street_group,street_category,price,path,referrer,source_component,position,device_type,landing_path,utm_source,utm_medium,utm_campaign,metadata,created_at${dateFilter}&order=created_at.desc&limit=${limit}`, 500);
  } catch (error) {
    console.error("Street analytics read failed", error);
    return [];
  }
}

export async function getRecentOutboundClicks(limit = 20000, since?: string): Promise<OutboundClickRow[]> {
  if (!hasSupabaseCatalog()) return [];
  try {
    const dateFilter = since ? `&created_at=gte.${encodeURIComponent(since)}` : "";
    return await supabaseRestAll<OutboundClickRow[]>(`outbound_clicks?select=brand_slug,product_slug,destination_url,anonymous_user_id,session_id,source_component,source_path,search_query,position,referrer,utm_source,utm_medium,utm_campaign,created_at${dateFilter}&order=created_at.desc&limit=${limit}`, 500);
  } catch (error) {
    console.error("Street outbound click read failed", error);
    return [];
  }
}
