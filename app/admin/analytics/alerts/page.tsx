import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { getRecentSiteEvents, getRecentOutboundClicks } from "@/lib/analytics";

export const dynamic = "force-dynamic";

type Alert = { severity: "critical" | "warning" | "info"; title: string; detail: string };

function percent(value: number, total: number) {
  return total ? (value / total) * 100 : 0;
}

export default async function AnalyticsAlertsPage() {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();
  const fourteenDaysAgo = new Date(now - 14 * 86400000).toISOString();
  const [events, clicks] = await Promise.all([getRecentSiteEvents(100000, fourteenDaysAgo), getRecentOutboundClicks(100000, fourteenDaysAgo)]);
  const currentEvents = events.filter((event) => event.created_at >= sevenDaysAgo);
  const previousEvents = events.filter((event) => event.created_at < sevenDaysAgo);
  const currentClicks = clicks.filter((click) => click.created_at >= sevenDaysAgo);
  const previousClicks = clicks.filter((click) => click.created_at < sevenDaysAgo);
  const alerts: Alert[] = [];
  const latestEventAt = events[0] ? new Date(events[0].created_at).getTime() : 0;
  if (!latestEventAt || now - latestEventAt > 6 * 3600000) alerts.push({ severity: "critical", title: "Analytics may have stopped", detail: latestEventAt ? `No event received in ${Math.floor((now - latestEventAt) / 3600000)} hours.` : "No analytics events have been received." });
  const currentSessions = new Set(currentEvents.map((event) => event.session_id).filter(Boolean)).size;
  const previousSessions = new Set(previousEvents.map((event) => event.session_id).filter(Boolean)).size;
  if (previousSessions >= 10 && currentSessions < previousSessions * 0.6) alerts.push({ severity: "warning", title: "Traffic dropped sharply", detail: `Sessions are down ${Math.round(100 - percent(currentSessions, previousSessions))}% versus the previous seven days.` });
  if (previousClicks.length >= 5 && currentClicks.length < previousClicks.length * 0.5) alerts.push({ severity: "warning", title: "Outbound traffic dropped", detail: `Outbound clicks fell from ${previousClicks.length} to ${currentClicks.length}.` });
  const errors = currentEvents.filter((event) => ["javascript_error", "unhandled_rejection", "broken_image"].includes(event.event_type));
  if (errors.length >= 10) alerts.push({ severity: "critical", title: "Technical errors are elevated", detail: `${errors.length} browser or image errors were recorded in the last seven days.` });
  else if (errors.length >= 3) alerts.push({ severity: "warning", title: "Technical errors need review", detail: `${errors.length} browser or image errors were recorded in the last seven days.` });
  const impressions = currentEvents.filter((event) => event.event_type === "product_impression").length;
  const productClicks = currentEvents.filter((event) => event.event_type === "product_click").length;
  if (impressions >= 100 && percent(productClicks, impressions) < 3) alerts.push({ severity: "warning", title: "Product CTR is weak", detail: `Current product CTR is ${percent(productClicks, impressions).toFixed(1)}%. Review product imagery, ordering, and relevance.` });
  const searches = currentEvents.filter((event) => event.event_type === "search");
  const zeroResult = searches.filter((event) => event.results_count === 0).length;
  if (searches.length >= 10 && percent(zeroResult, searches.length) >= 20) alerts.push({ severity: "warning", title: "Too many searches return nothing", detail: `${percent(zeroResult, searches.length).toFixed(1)}% of searches had zero results.` });
  if (!alerts.length) alerts.push({ severity: "info", title: "No urgent analytics alerts", detail: "Traffic, tracking freshness, conversion, and technical-error thresholds are currently within normal ranges." });

  return <div className={styles.shell}>
    <AdminNav active="/admin/analytics" />
    <h1 className={styles.title}>Analytics alerts</h1>
    <p className={styles.subtitle}>Rules automatically evaluate tracking freshness, traffic, conversion, search quality, and technical health.</p>
    <div style={{ display: "grid", gap: 12, marginTop: 24 }}>{alerts.map((alert, index) => <div key={`${alert.title}-${index}`} className={styles.section} style={{ borderLeft: `5px solid ${alert.severity === "critical" ? "#b42318" : alert.severity === "warning" ? "#b54708" : "#175cd3"}` }}><p style={{ margin: 0, fontSize: 12, textTransform: "uppercase", fontWeight: 800 }}>{alert.severity}</p><h2 style={{ margin: "6px 0" }}>{alert.title}</h2><p className={styles.rowMeta}>{alert.detail}</p></div>)}</div>
  </div>;
}
