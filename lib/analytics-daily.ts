import { hasSupabaseCatalog, supabaseRest, supabaseRestAll } from "@/lib/supabase-rest";
import { isMissingTableError } from "@/lib/admin-state";
import { addDaysToYmd, easternYmdOf, parseDateInput, ymdToInputValue, zonedMidnightToUtcMs } from "@/lib/date-range";
import { analyzeAudience, buildAnalyticsTrend, type AnalyticsTrendPoint } from "@/lib/analytics-audience";
import type { OutboundClickRow, SiteEventRow } from "@/lib/analytics";

/**
 * Daily roll-ups (table analytics_daily, migration 20261016). Each completed reporting day is
 * summarised once from its raw events with the same code the dashboard uses. When a long range has
 * more raw events than the dashboard can load, the chart uses these rows for the days it could not
 * load, so the day-by-day line stays complete. Range totals are still computed from loaded events.
 */
export type DailySnapshot = {
  day: string;
  visitors: number;
  recordedVisitors: number;
  sessions: number;
  outboundClicks: number;
  intentValue: number;
};

const DAY_MS = 86_400_000;

/** [startMs, endMs) of one reporting day given as YYYY-MM-DD in `timeZone`. */
export function dayWindow(day: string, timeZone: string): { startMs: number; endMs: number } | null {
  const ymd = parseDateInput(day);
  if (!ymd) return null;
  return { startMs: zonedMidnightToUtcMs(ymd, timeZone), endMs: zonedMidnightToUtcMs(addDaysToYmd(ymd, 1), timeZone) };
}

/** Builds one day's snapshot from that day's raw rows. */
export function snapshotFromRows(day: string, events: SiteEventRow[], clicks: OutboundClickRow[], timeZone: string): DailySnapshot | null {
  const window = dayWindow(day, timeZone);
  if (!window) return null;
  const inDayEvents = events.filter((event) => {
    const at = Date.parse(event.created_at);
    return at >= window.startMs && at < window.endMs;
  });
  const inDayClicks = clicks.filter((click) => {
    const at = Date.parse(click.created_at);
    return at >= window.startMs && at < window.endMs;
  });
  const audience = analyzeAudience(inDayEvents, inDayClicks);
  const point = buildAnalyticsTrend(inDayEvents, inDayClicks, { ...window, hourly: false }, audience.likelyHumanIds, timeZone)[0];
  return {
    day,
    visitors: point?.visitors ?? 0,
    recordedVisitors: point?.recordedVisitors ?? 0,
    sessions: point?.sessions ?? 0,
    outboundClicks: point?.outboundClicks ?? 0,
    intentValue: Math.round((point?.intentValue ?? 0) * 100) / 100,
  };
}

/**
 * Replaces chart points for days the dashboard could not fully load (days that start before the
 * oldest loaded event) with stored snapshots. Points without a snapshot are left as they are.
 * Only daily charts are touched.
 */
export function fillTrendFromSnapshots(trend: AnalyticsTrendPoint[], snapshots: DailySnapshot[], oldestLoadedMs: number | null, timeZone: string): { points: AnalyticsTrendPoint[]; filled: number } {
  if (oldestLoadedMs === null || !snapshots.length) return { points: trend, filled: 0 };
  const byDay = new Map(snapshots.map((snapshot) => [snapshot.day, snapshot]));
  let filled = 0;
  const points = trend.map((point) => {
    const snapshot = byDay.get(point.key);
    const window = dayWindow(point.key, timeZone);
    if (!snapshot || !window || window.startMs >= oldestLoadedMs) return point;
    filled += 1;
    return { ...point, visitors: snapshot.visitors, recordedVisitors: snapshot.recordedVisitors, sessions: snapshot.sessions, outboundClicks: snapshot.outboundClicks, intentValue: snapshot.intentValue };
  });
  return { points, filled };
}

type Row = { day: string; visitors: number; recorded_visitors: number; sessions: number; outbound_clicks: number; intent_value: number | string };

export async function loadDailySnapshots(timeZone: string, fromDay: string, toDay: string): Promise<{ snapshots: DailySnapshot[]; available: boolean }> {
  if (!hasSupabaseCatalog()) return { snapshots: [], available: false };
  try {
    const rows = await supabaseRestAll<Row[]>(`analytics_daily?select=day,visitors,recorded_visitors,sessions,outbound_clicks,intent_value&tz=eq.${encodeURIComponent(timeZone)}&day=gte.${fromDay}&day=lte.${toDay}&order=day.asc`, 1000, 5000);
    return {
      available: true,
      snapshots: rows.map((row) => ({ day: row.day, visitors: row.visitors, recordedVisitors: row.recorded_visitors, sessions: row.sessions, outboundClicks: row.outbound_clicks, intentValue: Number(row.intent_value) })),
    };
  } catch (error) {
    if (isMissingTableError(error)) return { snapshots: [], available: false };
    throw error;
  }
}

async function dayRows(window: { startMs: number; endMs: number }) {
  const range = `created_at=gte.${encodeURIComponent(new Date(window.startMs).toISOString())}&created_at=lt.${encodeURIComponent(new Date(window.endMs).toISOString())}&excluded=is.false&order=created_at.asc`;
  const [events, clicks] = await Promise.all([
    supabaseRestAll<SiteEventRow[]>(`site_events?select=event_type,anonymous_user_id,session_id,query,results_count,product_id,brand_slug,street_group,street_category,price,path,referrer,source_component,position,device_type,browser,operating_system,screen_width,language,timezone,landing_path,utm_source,utm_medium,utm_campaign,metadata,created_at&${range}`, 1000, 100000),
    supabaseRestAll<OutboundClickRow[]>(`outbound_clicks?select=product_id,brand_slug,product_slug,product_title,product_price,destination_url,anonymous_user_id,session_id,source_component,source_path,search_query,position,referrer,utm_source,utm_medium,utm_campaign,created_at&${range}`, 1000, 100000),
  ]);
  return { events, clicks };
}

/**
 * Writes snapshots for completed reporting days that are missing, oldest first, up to `maxDays` per
 * run. Starts at the earliest tracked event, or at `startFromDay` when given. Today is never stored.
 */
export async function computeMissingSnapshots(timeZone: string, nowMs: number, maxDays: number, earliestEventMs: number | null): Promise<{ computed: string[]; available: boolean; remaining: number }> {
  if (!hasSupabaseCatalog() || earliestEventMs === null) return { computed: [], available: hasSupabaseCatalog(), remaining: 0 };
  const today = ymdToInputValue(easternYmdOf(nowMs, timeZone));
  const first = ymdToInputValue(easternYmdOf(earliestEventMs, timeZone));
  const last = ymdToInputValue(addDaysToYmd(parseDateInput(today)!, -1));
  if (first > last) return { computed: [], available: true, remaining: 0 };

  const existing = await loadDailySnapshots(timeZone, first, last);
  if (!existing.available) return { computed: [], available: false, remaining: 0 };
  const have = new Set(existing.snapshots.map((snapshot) => snapshot.day));
  const missing: string[] = [];
  for (let day = first; day <= last; day = ymdToInputValue(addDaysToYmd(parseDateInput(day)!, 1))) if (!have.has(day)) missing.push(day);

  const todo = missing.slice(0, maxDays);
  const computed: string[] = [];
  for (const day of todo) {
    const window = dayWindow(day, timeZone);
    if (!window) continue;
    const { events, clicks } = await dayRows(window);
    const snapshot = snapshotFromRows(day, events, clicks, timeZone);
    if (!snapshot) continue;
    await supabaseRest("analytics_daily?on_conflict=tz,day", {
      method: "POST",
      body: { tz: timeZone, day, visitors: snapshot.visitors, recorded_visitors: snapshot.recordedVisitors, sessions: snapshot.sessions, outbound_clicks: snapshot.outboundClicks, intent_value: snapshot.intentValue, computed_at: new Date(nowMs).toISOString() },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
    computed.push(day);
  }
  return { computed, available: true, remaining: missing.length - computed.length };
}

export const DAILY_BACKFILL_PER_RUN = 20;
export { DAY_MS };
