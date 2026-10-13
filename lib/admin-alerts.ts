import { getAnalyticsRows, getRecentSiteEvents } from "@/lib/analytics";
import { buildWindowStats, inWindow } from "@/lib/analytics-metrics";
import { evaluateAlertRules, type Alert } from "@/lib/admin-alert-rules";
import { DEFAULT_ALERT_THRESHOLDS, normalizeThresholds, type AlertThresholds } from "@/lib/alert-thresholds";
import { splitAlerts, type AlertState, type AlertStates } from "@/lib/alert-states";
import { readAdminState } from "@/lib/admin-state";
import { getBrandDirectory, getBrandSyncStatuses } from "@/lib/catalog-store";
import { addDaysToYmd, parseDateInput, resolveDateRange, ymdToInputValue } from "@/lib/date-range";
import { getAdminTimeZone } from "@/lib/admin-timezone";
import { hasSupabaseCatalog, supabaseRestPage } from "@/lib/supabase-rest";


export type { Alert };

async function countSince(path: string) {
  if (!hasSupabaseCatalog()) return 0;
  try {
    // from/to: {0,0} asks PostgREST for a single row but the Content-Range
    // response header still reports the full matching count.
    const result = await supabaseRestPage(path, { from: 0, to: 0 }, { noStore: true });
    return result.total;
  } catch {
    return 0;
  }
}

/** Evaluates every admin alert rule against live data. Shared by the Alerts page and the top-bar bell. */
export async function computeAdminAlerts(thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS): Promise<Alert[]> {
  const nowMs = Date.now();
  const timeZone = await getAdminTimeZone();

  // Last 7 complete days (today is still in progress) against the 7 before.
  const yesterday = parseDateInput(resolveDateRange({ range: "yesterday" }, { timeZone, nowMs }).startDateInput);
  if (!yesterday) return [];
  const window = resolveDateRange(
    { range: "custom", start: ymdToInputValue(addDaysToYmd(yesterday, -6)), end: ymdToInputValue(yesterday), compare: "previous" },
    { timeZone, nowMs },
  );
  const compare = window.compare;
  if (!compare) return [];

  const sinceIso = new Date(compare.startMs).toISOString();
  const errorTypes = "event_type=in.(javascript_error,unhandled_rejection,broken_image)";
  const [{ events, clicks }, latestEvents, technicalErrors, brokenImages, brands, syncStatuses] = await Promise.all([
    getAnalyticsRows(sinceIso),
    getRecentSiteEvents(1),
    countSince(`site_events?select=id&${errorTypes}&created_at=gte.${encodeURIComponent(new Date(window.startMs).toISOString())}&created_at=lt.${encodeURIComponent(new Date(window.endMs).toISOString())}`),
    countSince(`site_events?select=id&event_type=eq.broken_image&created_at=gte.${encodeURIComponent(new Date(window.startMs).toISOString())}&created_at=lt.${encodeURIComponent(new Date(window.endMs).toISOString())}`),
    getBrandDirectory(),
    getBrandSyncStatuses(),
  ]);

  // Stale brand syncs: a brand whose store isn't closed/password-protected
  // (that case is an expected skip, not staleness -- see lib/catalog-store.ts)
  // but hasn't completed a real sync in days.
  const staleCutoff = nowMs - thresholds.staleSyncDays * 86400000;
  const staleBrandNames = brands
    .filter((brand) => brand.catalogEnabled && brand.storefrontStatus !== "closed")
    .map((brand) => ({ brand, status: syncStatuses.get(brand.slug) }))
    .filter(({ status }) => !status?.lastSuccessAt || new Date(status.lastSuccessAt).getTime() < staleCutoff)
    .map(({ brand }) => brand.name);

  return evaluateAlertRules({
    nowMs,
    latestEventAtMs: latestEvents[0] ? new Date(latestEvents[0].created_at).getTime() : 0,
    current: buildWindowStats(inWindow(events, window.startMs, window.endMs), inWindow(clicks, window.startMs, window.endMs)),
    previous: buildWindowStats(inWindow(events, compare.startMs, compare.endMs), inWindow(clicks, compare.startMs, compare.endMs)),
    technicalErrors,
    brokenImages,
    staleBrandNames,
  }, thresholds);
}

export type AlertView = {
  /** Alerts that need attention now (never contains the "all clear" notice). */
  active: Alert[];
  /** Alerts an admin has acknowledged or snoozed. */
  silenced: Array<{ alert: Alert; state: AlertState }>;
  thresholds: AlertThresholds;
  /** False until the admin_state migration is applied; acknowledge/snooze/thresholds are off until then. */
  statesAvailable: boolean;
  critical: number;
};

/** Alerts with the admin's thresholds applied and acknowledged/snoozed ones set aside. */
export async function loadAlertView(nowMs: number = Date.now()): Promise<AlertView> {
  const [thresholdState, statesState] = await Promise.all([
    readAdminState<unknown>("alert_thresholds", {}),
    readAdminState<AlertStates>("alert_states", {}),
  ]);
  const thresholds = normalizeThresholds(thresholdState.value);
  const alerts = (await computeAdminAlerts(thresholds)).filter((alert) => alert.severity !== "info");
  const { active, silenced } = splitAlerts(alerts, statesState.value, nowMs);
  return { active, silenced, thresholds, statesAvailable: statesState.available, critical: active.filter((alert) => alert.severity === "critical").length };
}

let cached: { at: number; count: number; critical: number } | null = null;

/** Number of alerts needing attention (acknowledged/snoozed ones excluded), memoized for 5 minutes so the bell does not re-query on every page navigation. */
export async function getAdminAlertSummary(): Promise<{ count: number; critical: number }> {
  if (cached && Date.now() - cached.at < 5 * 60_000) return { count: cached.count, critical: cached.critical };
  try {
    const view = await loadAlertView();
    cached = { at: Date.now(), count: view.active.length, critical: view.critical };
    return { count: cached.count, critical: cached.critical };
  } catch {
    return { count: 0, critical: 0 };
  }
}

/** Forget the memoized bell count (called after an alert is acknowledged, snoozed or restored). */
export function resetAlertSummaryCache() {
  cached = null;
}
