import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";

export type AnalyticsDailySummary = {
  day: string;
  events: number | string;
  visitors: number | string;
  sessions: number | string;
  page_views: number | string;
  product_impressions: number | string;
  product_clicks: number | string;
  product_views: number | string;
  searches: number | string;
  zero_result_searches: number | string;
  outbound_clicks: number | string;
  outbound_sessions: number | string;
  technical_errors: number | string;
  average_load_ms: number | string;
};

export type AnalyticsBrandDailySummary = {
  day: string;
  brand_slug: string;
  impressions: number | string;
  product_clicks: number | string;
  product_views: number | string;
  sessions: number | string;
  outbound_clicks: number | string;
  outbound_sessions: number | string;
};

export function summaryNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getAnalyticsDailySummaries(sinceDay: string): Promise<AnalyticsDailySummary[]> {
  if (!hasSupabaseCatalog()) return [];
  try {
    return await supabaseRest<AnalyticsDailySummary[]>(`analytics_daily_summary?select=*&day=gte.${encodeURIComponent(sinceDay)}&order=day.asc`, { noStore: true });
  } catch (error) {
    console.error("Street analytics summary read failed", error);
    return [];
  }
}

export async function getAnalyticsBrandDailySummaries(brandSlug: string, sinceDay: string): Promise<AnalyticsBrandDailySummary[]> {
  if (!hasSupabaseCatalog()) return [];
  try {
    return await supabaseRest<AnalyticsBrandDailySummary[]>(`analytics_brand_daily?select=*&brand_slug=eq.${encodeURIComponent(brandSlug)}&day=gte.${encodeURIComponent(sinceDay)}&order=day.asc`, { noStore: true });
  } catch (error) {
    console.error("Street brand analytics summary read failed", error);
    return [];
  }
}
