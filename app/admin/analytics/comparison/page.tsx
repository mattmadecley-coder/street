import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { getRecentSiteEvents, getRecentOutboundClicks, type SiteEventRow, type OutboundClickRow } from "@/lib/analytics";

export const dynamic = "force-dynamic";

function unique(values: Array<string | null>) {
  return new Set(values.filter((value): value is string => Boolean(value))).size;
}

function metrics(events: SiteEventRow[], clicks: OutboundClickRow[]) {
  const sessions = unique(events.map((event) => event.session_id));
  const visitors = unique(events.map((event) => event.anonymous_user_id));
  const impressions = events.filter((event) => event.event_type === "product_impression").length;
  const productClicks = events.filter((event) => event.event_type === "product_click").length;
  const views = events.filter((event) => event.event_type === "product_view").length;
  const searches = events.filter((event) => event.event_type === "search").length;
  const outboundSessions = unique(clicks.map((click) => click.session_id));
  return { visitors, sessions, impressions, productClicks, views, searches, outbound: clicks.length, outboundSessions };
}

function change(current: number, previous: number) {
  if (!previous) return current ? "+100.0%" : "0.0%";
  const value = ((current - previous) / previous) * 100;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function rate(value: number, total: number) {
  return total ? `${((value / total) * 100).toFixed(1)}%` : "0.0%";
}

export default async function AnalyticsComparisonPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const params = await searchParams;
  const days = [7, 30, 90].includes(Number(params.days)) ? Number(params.days) : 30;
  const now = Date.now();
  const currentStart = new Date(now - days * 86400000).toISOString();
  const previousStart = new Date(now - days * 2 * 86400000).toISOString();
  const [allEvents, allClicks] = await Promise.all([getRecentSiteEvents(100000, previousStart), getRecentOutboundClicks(100000, previousStart)]);
  const currentEvents = allEvents.filter((event) => event.created_at >= currentStart);
  const previousEvents = allEvents.filter((event) => event.created_at >= previousStart && event.created_at < currentStart);
  const currentClicks = allClicks.filter((click) => click.created_at >= currentStart);
  const previousClicks = allClicks.filter((click) => click.created_at >= previousStart && click.created_at < currentStart);
  const current = metrics(currentEvents, currentClicks);
  const previous = metrics(previousEvents, previousClicks);
  const rows: Array<[string, number, number, string]> = [
    ["Unique visitors", current.visitors, previous.visitors, change(current.visitors, previous.visitors)],
    ["Sessions", current.sessions, previous.sessions, change(current.sessions, previous.sessions)],
    ["Product impressions", current.impressions, previous.impressions, change(current.impressions, previous.impressions)],
    ["Product clicks", current.productClicks, previous.productClicks, change(current.productClicks, previous.productClicks)],
    ["Product views", current.views, previous.views, change(current.views, previous.views)],
    ["Searches", current.searches, previous.searches, change(current.searches, previous.searches)],
    ["Outbound clicks", current.outbound, previous.outbound, change(current.outbound, previous.outbound)],
  ];

  return <div className={styles.shell}>
    <AdminNav active="/admin/analytics" />
    <h1 className={styles.title}>Period comparison</h1>
    <p className={styles.subtitle}>Compare the most recent period with the immediately preceding period.</p>
    <form style={{ margin: "18px 0" }}><select name="days" defaultValue={String(days)} style={{ padding: "9px 12px" }}><option value="7">7 days vs previous 7</option><option value="30">30 days vs previous 30</option><option value="90">90 days vs previous 90</option></select><button className={styles.buttonSecondary} style={{ marginLeft: 8 }} type="submit">Apply</button></form>
    <div className={styles.section}><table className={styles.table}><thead><tr><th>Metric</th><th>Current</th><th>Previous</th><th>Change</th></tr></thead><tbody>{rows.map(([label, currentValue, previousValue, delta]) => <tr key={label}><td>{label}</td><td>{currentValue.toLocaleString()}</td><td>{previousValue.toLocaleString()}</td><td>{delta}</td></tr>)}</tbody></table></div>
    <div className={styles.section}><div className={styles.sectionHead}><h2>Conversion-rate comparison</h2></div><table className={styles.table}><thead><tr><th>Rate</th><th>Current</th><th>Previous</th></tr></thead><tbody><tr><td>Impression → product click</td><td>{rate(current.productClicks, current.impressions)}</td><td>{rate(previous.productClicks, previous.impressions)}</td></tr><tr><td>Product view → outbound</td><td>{rate(current.outbound, current.views)}</td><td>{rate(previous.outbound, previous.views)}</td></tr><tr><td>Session → outbound</td><td>{rate(current.outboundSessions, current.sessions)}</td><td>{rate(previous.outboundSessions, previous.sessions)}</td></tr></tbody></table></div>
  </div>;
}
