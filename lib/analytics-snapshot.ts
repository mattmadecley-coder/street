import type { DateRange } from "@/lib/date-range";
import { cacheFriendlySinceMs } from "@/lib/date-range";
import { getAnalyticsRows, getEarliestEventMs, type OutboundClickRow, type SiteEventRow } from "@/lib/analytics";
import { analyzeAudience, buildAnalyticsTrend, type AnalyticsTrendPoint } from "@/lib/analytics-audience";
import { buildWindowStats, inWindow, type WindowStats } from "@/lib/analytics-metrics";

export type RankedRow = { label: string; count: number };

export type RangeSnapshot = {
  range: DateRange;
  current: WindowStats;
  /** Null when the range has no comparison selected. */
  compare: WindowStats | null;
  trend: AnalyticsTrendPoint[];
  topBrands: RankedRow[];
  topSearches: RankedRow[];
  zeroResultSearches: RankedRow[];
  /** True when the raw-row cap clipped the oldest events, so totals for long ranges may be low. */
  truncated: boolean;
  /** Earliest event the loader saw, so the UI can explain "No prior data". */
  earliestEventMs: number | null;
};

function rank(values: Array<string | null | undefined>, limit = 6): RankedRow[] {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([label, count]) => ({ label, count }));
}

/**
 * Loads one fetch covering the selected range and its comparison window, then
 * computes identical metrics for both. Every range-aware page builds on this
 * (or on the same buildWindowStats) so their numbers agree.
 */
export async function loadRangeSnapshot(range: DateRange): Promise<RangeSnapshot> {
  const fetchFrom = Math.min(range.startMs, range.compare?.startMs ?? range.startMs);
  const [{ events, clicks, truncated }, earliestEventMs] = await Promise.all([
    getAnalyticsRows(new Date(cacheFriendlySinceMs(fetchFrom)).toISOString()),
    getEarliestEventMs(),
  ]);

  const currentEvents = inWindow(events, range.startMs, range.endMs);
  const currentClicks = inWindow(clicks, range.startMs, range.endMs);
  const current = buildWindowStats(currentEvents, currentClicks);
  const compare = range.compare
    ? buildWindowStats(inWindow(events, range.compare.startMs, range.compare.endMs), inWindow(clicks, range.compare.startMs, range.compare.endMs))
    : null;

  const audience = analyzeAudience(currentEvents, currentClicks);
  const humanEvents: SiteEventRow[] = currentEvents.filter((event) => event.anonymous_user_id && audience.likelyHumanIds.has(event.anonymous_user_id));
  const humanClicks: OutboundClickRow[] = currentClicks.filter((click) => click.anonymous_user_id && audience.likelyHumanIds.has(click.anonymous_user_id));
  const trend = buildAnalyticsTrend(currentEvents, currentClicks, { startMs: range.startMs, endMs: range.endMs, hourly: range.hourly }, audience.likelyHumanIds, range.timeZone);

  const searches = humanEvents.filter((event) => event.event_type === "search" && event.query);

  return {
    range,
    current,
    compare,
    trend,
    topBrands: rank(humanClicks.map((click) => click.brand_slug)),
    topSearches: rank(searches.map((event) => event.query?.toLowerCase().trim())),
    zeroResultSearches: rank(searches.filter((event) => event.results_count === 0).map((event) => event.query?.toLowerCase().trim())),
    truncated,
    earliestEventMs,
  };
}

/** True when the comparison window starts before any data exists, so "No prior data" is the honest answer. */
export function compareHasNoHistory(snapshot: RangeSnapshot): boolean {
  const compare = snapshot.range.compare;
  if (!compare || snapshot.earliestEventMs === null) return false;
  return snapshot.earliestEventMs > compare.startMs;
}
