import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { AnalyticsNav } from "@/components/admin/analytics-nav";
import { getAnalyticsDailySummaries, summaryNumber, type AnalyticsDailySummary } from "@/lib/analytics-summaries";
import { getRecentSiteEvents } from "@/lib/analytics";

export const dynamic = "force-dynamic";

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
  const [summaries, latestEvents] = await Promise.all([getAnalyticsDailySummaries(fourteenDay), getRecentSiteEvents(1)]);
  const current = aggregate(summaries.filter((row) => row.day >= sevenDay));
  const previous = aggregate(summaries.filter((row) => row.day >= fourteenDay && row.day < sevenDay));
  const alerts: Alert[] = [];
  const latestEventAt = latestEvents[0] ? new Date(latestEvents[0].created_at).getTime() : 0;
  if (!latestEventAt || now - latestEventAt > 6 * 3600000) alerts.push({ severity: "critical", title: "Analytics may have stopped", detail: latestEventAt ? `No event received in ${Math.floor((now - latestEventAt) / 3600000)} hours.` : "No analytics events have been received." });
  if (previous.sessions >= 10 && current.sessions < previous.sessions * 0.6) alerts.push({ severity: "warning", title: "Traffic dropped sharply", detail: `Sessions are down ${Math.round(100 - percent(current.sessions, previous.sessions))}% versus the previous seven days.` });
  if (previous.outbound >= 5 && current.outbound < previous.outbound * 0.5) alerts.push({ severity: "warning", title: "Outbound traffic dropped", detail: `Outbound clicks fell from ${previous.outbound} to ${current.outbound}.` });
  if (current.errors >= 10) alerts.push({ severity: "critical", title: "Technical errors are elevated", detail: `${current.errors} browser or image errors were recorded in the last seven days.` });
  else if (current.errors >= 3) alerts.push({ severity: "warning", title: "Technical errors need review", detail: `${current.errors} browser or image errors were recorded in the last seven days.` });
  if (current.impressions >= 100 && percent(current.productClicks, current.impressions) < 3) alerts.push({ severity: "warning", title: "Product CTR is weak", detail: `Current product CTR is ${percent(current.productClicks, current.impressions).toFixed(1)}%. Review product imagery, ordering, and relevance.` });
  if (current.searches >= 10 && percent(current.zeroResult, current.searches) >= 20) alerts.push({ severity: "warning", title: "Too many searches return nothing", detail: `${percent(current.zeroResult, current.searches).toFixed(1)}% of searches had zero results.` });
  if (!alerts.length) alerts.push({ severity: "info", title: "No urgent analytics alerts", detail: "Traffic, tracking freshness, conversion, and technical-error thresholds are currently within normal ranges." });
  const actionableCount = alerts.filter((alert) => alert.severity !== "info").length;

  return <div className={styles.shell}>
    <AdminNav active="/admin/analytics" />
    <AnalyticsNav active="/admin/analytics/alerts" alertCount={actionableCount} />
    <h1 className={styles.title}>Analytics alerts</h1>
    <p className={styles.subtitle}>Rules evaluate tracking freshness plus daily summary trends without loading the full raw-event history.</p>
    <div style={{ display: "grid", gap: 12, marginTop: 24 }}>{alerts.map((alert, index) => <div key={`${alert.title}-${index}`} className={styles.section} style={{ borderLeft: `5px solid ${alert.severity === "critical" ? "#b42318" : alert.severity === "warning" ? "#b54708" : "#175cd3"}` }}><p style={{ margin: 0, fontSize: 12, textTransform: "uppercase", fontWeight: 800 }}>{alert.severity}</p><h2 style={{ margin: "6px 0" }}>{alert.title}</h2><p className={styles.rowMeta}>{alert.detail}</p></div>)}</div>
  </div>;
}
