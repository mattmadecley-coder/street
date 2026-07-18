import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { AnalyticsNav } from "@/components/admin/analytics-nav";
import { getAnalyticsDailySummaries, summaryNumber, type AnalyticsDailySummary } from "@/lib/analytics-summaries";

export const dynamic = "force-dynamic";

function aggregate(rows: AnalyticsDailySummary[]) {
  return rows.reduce((total, row) => ({
    visitors: total.visitors + summaryNumber(row.visitors),
    sessions: total.sessions + summaryNumber(row.sessions),
    impressions: total.impressions + summaryNumber(row.product_impressions),
    productClicks: total.productClicks + summaryNumber(row.product_clicks),
    views: total.views + summaryNumber(row.product_views),
    searches: total.searches + summaryNumber(row.searches),
    outbound: total.outbound + summaryNumber(row.outbound_clicks),
    outboundSessions: total.outboundSessions + summaryNumber(row.outbound_sessions),
  }), { visitors: 0, sessions: 0, impressions: 0, productClicks: 0, views: 0, searches: 0, outbound: 0, outboundSessions: 0 });
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
  const today = new Date();
  const currentStart = new Date(today.getTime() - days * 86400000).toISOString().slice(0, 10);
  const previousStart = new Date(today.getTime() - days * 2 * 86400000).toISOString().slice(0, 10);
  const summaries = await getAnalyticsDailySummaries(previousStart);
  const current = aggregate(summaries.filter((row) => row.day >= currentStart));
  const previous = aggregate(summaries.filter((row) => row.day >= previousStart && row.day < currentStart));
  const rows: Array<[string, number, number, string]> = [
    ["Unique visitors (daily total)", current.visitors, previous.visitors, change(current.visitors, previous.visitors)],
    ["Sessions (daily total)", current.sessions, previous.sessions, change(current.sessions, previous.sessions)],
    ["Product impressions", current.impressions, previous.impressions, change(current.impressions, previous.impressions)],
    ["Product clicks", current.productClicks, previous.productClicks, change(current.productClicks, previous.productClicks)],
    ["Product views", current.views, previous.views, change(current.views, previous.views)],
    ["Searches", current.searches, previous.searches, change(current.searches, previous.searches)],
    ["Outbound clicks", current.outbound, previous.outbound, change(current.outbound, previous.outbound)],
  ];

  return <div className={styles.shell}>
    <AdminNav active="/admin/analytics" />
    <AnalyticsNav active="/admin/analytics/comparison" />
    <h1 className={styles.title}>Period comparison</h1>
    <p className={styles.subtitle}>Fast daily summaries compare the most recent period with the immediately preceding period.</p>
    <form style={{ margin: "18px 0" }}><select name="days" defaultValue={String(days)} style={{ padding: "9px 12px" }}><option value="7">7 days vs previous 7</option><option value="30">30 days vs previous 30</option><option value="90">90 days vs previous 90</option></select><button className={styles.buttonSecondary} style={{ marginLeft: 8 }} type="submit">Apply</button></form>
    <div className={styles.section}><table className={styles.table}><thead><tr><th>Metric</th><th>Current</th><th>Previous</th><th>Change</th></tr></thead><tbody>{rows.map(([label, currentValue, previousValue, delta]) => <tr key={label}><td>{label}</td><td>{currentValue.toLocaleString()}</td><td>{previousValue.toLocaleString()}</td><td>{delta}</td></tr>)}</tbody></table></div>
    <div className={styles.section}><div className={styles.sectionHead}><h2>Conversion-rate comparison</h2></div><table className={styles.table}><thead><tr><th>Rate</th><th>Current</th><th>Previous</th></tr></thead><tbody><tr><td>Impression → product click</td><td>{rate(current.productClicks, current.impressions)}</td><td>{rate(previous.productClicks, previous.impressions)}</td></tr><tr><td>Product view → outbound</td><td>{rate(current.outbound, current.views)}</td><td>{rate(previous.outbound, previous.views)}</td></tr><tr><td>Session → outbound</td><td>{rate(current.outboundSessions, current.sessions)}</td><td>{rate(previous.outboundSessions, previous.sessions)}</td></tr></tbody></table></div>
  </div>;
}
