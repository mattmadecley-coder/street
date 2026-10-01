import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { AnalyticsNav } from "@/components/admin/analytics-nav";
import { getAnalyticsDailySummaries, summaryNumber, type AnalyticsDailySummary } from "@/lib/analytics-summaries";
import { getRecentSiteEvents } from "@/lib/analytics";
import { getBrandDirectory, getBrandSyncStatuses } from "@/lib/catalog-store";
import { hasSupabaseCatalog, supabaseRestPage } from "@/lib/supabase-rest";

export const dynamic = "force-dynamic";

async function countSince(path: string) {
  if (!hasSupabaseCatalog()) return 0;
  try {
    // from/to: {0,0} asks PostgREST for a single row but the Content-Range
    // response header still reports the full matching count -- the same
    // cheap "count without fetching rows" trick app/admin/page.tsx uses.
    const result = await supabaseRestPage(path, { from: 0, to: 0 }, { noStore: true });
    return result.total;
  } catch {
    return 0;
  }
}

// A brand synced daily can legitimately go a couple of days without a
// *successful* run (a transient source outage, a slow day), so this only
// flags brands clearly past that -- stale enough that something is actually
// wrong, not just mid-retry.
const STALE_SYNC_DAYS = 4;

type Alert = { severity: "critical" | "warning" | "info"; title: string; detail: string };

function percent(value: number, total: number) {
  return total ? (value / total) * 100 : 0;
}

function aggregate(rows: AnalyticsDailySummary[]) {
  return rows.reduce((total, row) => ({
    sessions: total.sessions + summaryNumber(row.sessions),
    outbound: total.outbound + summaryNumber(row.outbound_clicks),
    impressions: total.impressions + summaryNumber(row.product_impressions),
    productClicks: total.productClicks + summaryNumber(row.product_clicks),
    searches: total.searches + summaryNumber(row.searches),
    zeroResult: total.zeroResult + summaryNumber(row.zero_result_searches),
    errors: total.errors + summaryNumber(row.technical_errors),
  }), { sessions: 0, outbound: 0, impressions: 0, productClicks: 0, searches: 0, zeroResult: 0, errors: 0 });
}

export default async function AnalyticsAlertsPage() {
  const now = Date.now();
  const sevenDay = new Date(now - 7 * 86400000).toISOString().slice(0, 10);
  const fourteenDay = new Date(now - 14 * 86400000).toISOString().slice(0, 10);
  const sevenDaysAgoIso = new Date(now - 7 * 86400000).toISOString();
  const [summaries, latestEvents, brokenImageCount, brands, syncStatuses] = await Promise.all([
    getAnalyticsDailySummaries(fourteenDay),
    getRecentSiteEvents(1),
    countSince(`site_events?select=id&event_type=eq.broken_image&created_at=gte.${encodeURIComponent(sevenDaysAgoIso)}`),
    getBrandDirectory(),
    getBrandSyncStatuses(),
  ]);
  const current = aggregate(summaries.filter((row) => row.day >= sevenDay));
  const previous = aggregate(summaries.filter((row) => row.day >= fourteenDay && row.day < sevenDay));
  const alerts: Alert[] = [];
  const latestEventAt = latestEvents[0] ? new Date(latestEvents[0].created_at).getTime() : 0;
  if (!latestEventAt || now - latestEventAt > 6 * 3600000) alerts.push({ severity: "critical", title: "Analytics may have stopped", detail: latestEventAt ? `No event received in ${Math.floor((now - latestEventAt) / 3600000)} hours.` : "No analytics events have been received." });
  if (previous.sessions >= 10 && current.sessions < previous.sessions * 0.6) alerts.push({ severity: "warning", title: "Traffic dropped sharply", detail: `Sessions are down ${Math.round(100 - percent(current.sessions, previous.sessions))}% versus the previous seven days.` });
  if (previous.outbound >= 5 && current.outbound < previous.outbound * 0.5) alerts.push({ severity: "warning", title: "Outbound traffic dropped", detail: `Outbound clicks fell from ${previous.outbound} to ${current.outbound}.` });
  if (current.errors >= 10) alerts.push({ severity: "critical", title: "Technical errors are elevated", detail: `${current.errors} browser or image errors were recorded in the last seven days.` });
  else if (current.errors >= 3) alerts.push({ severity: "warning", title: "Technical errors need review", detail: `${current.errors} browser or image errors were recorded in the last seven days.` });
  // Broken images get their own call-out (not just folded into the generic
  // "technical errors" count above) because they have a direct, one-click
  // fix -- Sync now on the affected brand -- the way a stray JS error
  // usually doesn't. See the Moojimoojius fix (2026-10-01): 150 products hid
  // behind a single bucket for months because nothing singled this out.
  if (brokenImageCount >= 20) alerts.push({ severity: "critical", title: "Broken product images detected", detail: `${brokenImageCount} broken_image events in the last 7 days. Check /admin/brands for the affected brand(s) and use Sync now to refresh their photos.` });
  else if (brokenImageCount >= 5) alerts.push({ severity: "warning", title: "Some product images are broken", detail: `${brokenImageCount} broken_image events in the last 7 days. Check /admin/brands for the affected brand(s).` });
  if (current.impressions >= 100 && percent(current.productClicks, current.impressions) < 3) alerts.push({ severity: "warning", title: "Product CTR is weak", detail: `Current product CTR is ${percent(current.productClicks, current.impressions).toFixed(1)}%. Review product imagery, ordering, and relevance.` });
  if (current.searches >= 10 && percent(current.zeroResult, current.searches) >= 20) alerts.push({ severity: "warning", title: "Too many searches return nothing", detail: `${percent(current.zeroResult, current.searches).toFixed(1)}% of searches had zero results.` });
  // Stale brand syncs: a brand whose store isn't closed/password-protected
  // (that case is an expected skip, not staleness -- see lib/catalog-store.ts)
  // but hasn't completed a real sync in days. These sit invisibly in
  // /admin/brands unless an admin happens to scroll to that exact row; this
  // is the one place meant to surface them proactively.
  const staleCutoff = now - STALE_SYNC_DAYS * 86400000;
  const staleBrands = brands
    .filter((brand) => brand.catalogEnabled && brand.storefrontStatus !== "closed")
    .map((brand) => ({ brand, status: syncStatuses.get(brand.slug) }))
    .filter(({ status }) => !status?.lastSuccessAt || new Date(status.lastSuccessAt).getTime() < staleCutoff);
  if (staleBrands.length) alerts.push({ severity: staleBrands.length >= 5 ? "critical" : "warning", title: `${staleBrands.length} brand${staleBrands.length === 1 ? "" : "s"} ha${staleBrands.length === 1 ? "s" : "ve"} not synced successfully in ${STALE_SYNC_DAYS}+ days`, detail: `${staleBrands.slice(0, 8).map(({ brand }) => brand.name).join(", ")}${staleBrands.length > 8 ? `, and ${staleBrands.length - 8} more` : ""} — check /admin/brands for the reason (source errors, a changed store layout, etc).` });
  if (!alerts.length) alerts.push({ severity: "info", title: "No urgent analytics alerts", detail: "Traffic, tracking freshness, conversion, broken images, sync freshness, and technical-error thresholds are currently within normal ranges." });
  const actionableCount = alerts.filter((alert) => alert.severity !== "info").length;

  return <div className={styles.shell}>
    <AdminNav active="/admin/analytics" />
    <AnalyticsNav active="/admin/analytics/alerts" alertCount={actionableCount} />
    <h1 className={styles.title}>Analytics alerts</h1>
    <p className={styles.subtitle}>Rules evaluate tracking freshness plus daily summary trends without loading the full raw-event history.</p>
    <div style={{ display: "grid", gap: 12, marginTop: 24 }}>{alerts.map((alert, index) => <div key={`${alert.title}-${index}`} className={styles.section} style={{ borderLeft: `5px solid ${alert.severity === "critical" ? "#b42318" : alert.severity === "warning" ? "#b54708" : "#175cd3"}` }}><p style={{ margin: 0, fontSize: 12, textTransform: "uppercase", fontWeight: 800 }}>{alert.severity}</p><h2 style={{ margin: "6px 0" }}>{alert.title}</h2><p className={styles.rowMeta}>{alert.detail}</p></div>)}</div>
  </div>;
}
