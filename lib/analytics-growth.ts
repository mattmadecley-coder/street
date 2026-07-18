import { hasSupabaseCatalog, supabaseRestAll } from "@/lib/supabase-rest";

export type SearchDailyRow = {
  day: string;
  query: string;
  searches: number | string;
  zero_result_searches: number | string;
  total_results: number | string;
  search_clicks: number | string;
  outbound_clicks: number | string;
  outbound_sessions: number | string;
};

export type CampaignDailyRow = {
  day: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  visitors: number | string;
  sessions: number | string;
  page_views: number | string;
  product_views: number | string;
  searches: number | string;
  outbound_clicks: number | string;
  outbound_sessions: number | string;
};

export type PositionDailyRow = {
  day: string;
  source_component: string;
  position: number | string;
  impressions: number | string;
  product_clicks: number | string;
  impression_sessions: number | string;
  click_sessions: number | string;
};

function sinceFilter(since: string) {
  return `day=gte.${encodeURIComponent(since.slice(0, 10))}`;
}

export async function getSearchDaily(since: string): Promise<SearchDailyRow[]> {
  if (!hasSupabaseCatalog()) return [];
  return supabaseRestAll<SearchDailyRow[]>(`analytics_search_daily?select=*&${sinceFilter(since)}&order=day.desc`, 500);
}

export async function getCampaignDaily(since: string): Promise<CampaignDailyRow[]> {
  if (!hasSupabaseCatalog()) return [];
  return supabaseRestAll<CampaignDailyRow[]>(`analytics_campaign_daily?select=*&${sinceFilter(since)}&order=day.desc`, 500);
}

export async function getPositionDaily(since: string): Promise<PositionDailyRow[]> {
  if (!hasSupabaseCatalog()) return [];
  return supabaseRestAll<PositionDailyRow[]>(`analytics_position_daily?select=*&${sinceFilter(since)}&order=day.desc`, 500);
}
