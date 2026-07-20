import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { AnalyticsNav } from "@/components/admin/analytics-nav";
import { getRecentOutboundClicks, getRecentSiteEvents, type OutboundClickRow, type SiteEventRow } from "@/lib/analytics";
import { analyzeAudience, summarizePurchaseIntent } from "@/lib/analytics-audience";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function unique(values: Array<string | null>) {
  return new Set(values.filter((value): value is string => Boolean(value))).size;
}

function metrics(events: SiteEventRow[], clicks: OutboundClickRow[]) {
  const audience = analyzeAudience(events, clicks);
  const qualifiedEvents = events.filter((event) => Boolean(event.anonymous_user_id && audience.likelyHumanIds.has(event.anonymous_user_id)));
  const qualifiedClicks = clicks.filter((click) => Boolean(click.anonymous_user_id && audience.likelyHumanIds.has(click.anonymous_user_id)));
  const intent = summarizePurchaseIntent(qualifiedClicks);

  return {
    visitors: audience.likelyHumanVisitors,
    recordedVisitors: audience.recordedVisitors,
    sessions: unique(qualifiedEvents.map((event) => event.session_id)),
    impressions: qualifiedEvents.filter((event) => event.event_type === "product_impression").length,
    productClicks: qualifiedEvents.filter((event) => event.event_type === "product_click").length,
    views: qualifiedEvents.filter((event) => event.event_type === "product_view").length,
    searches: qualifiedEvents.filter((event) => event.event_type === "search").length,
    outbound: intent.outboundClicks,
    outboundSessions: intent.uniqueSessions,
    outboundShoppers: intent.uniqueShoppers,
    intentValue: intent.intentValue,
  };
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
  const currentStart = now - days * 86400000;
  const previousStart = now - days * 2 * 86400000;
  const since = new Date(previousStart).toISOString();
  const [events, clicks] = await Promise.all([
    getRecentSiteEvents(200000, since),
    getRecentOutboundClicks(200000, since),
  ]);

  const current = metrics(
    events.filter((event) => new Date(event.created_at).getTime() >= currentStart),
    clicks.filter((click) => new Date(click.created_at).getTime() >= currentStart),
  );
  const previous = metrics(
    events.filter((event) => {
      const at = new Date(event.created_at).getTime();
      return at >= previousStart && at < currentStart;
    }),
    clicks.filter((click) => {
      const at = new Date(click.created_at).getTime();
      return at >= previousStart && at < currentStart;
    }),
  );

  const rows: Array<[string, number, number, string, "number" | "money"]> = [
    ["Likely human visitors", current.visitors, previous.visitors, change(current.visitors, previous.visitors), "number"],
    ["Recorded browser IDs", current.recordedVisitors, previous.recordedVisitors, change(current.recordedVisitors, previous.recordedVisitors), "number"],
    ["Sessions", current.sessions, previous.sessions, change(current.sessions, previous.sessions), "number"],
    ["Product impressions", current.impressions, previous.impressions, change(current.impressions, previous.impressions), "number"],
    ["Product clicks", current.productClicks, previous.productClicks, change(current.productClicks, previous.productClicks), "number"],
    ["Product views", current.views, previous.views, change(current.views, previous.views), "number"],
    ["Searches", current.searches, previous.searches, change(current.searches, previous.searches), "number"],
    ["Outbound clicks", current.outbound, previous.outbound, change(current.outbound, previous.outbound), "number"],
    ["Outbound shoppers", current.outboundShoppers, previous.outboundShoppers, change(current.outboundShoppers, previous.outboundShoppers), "number"],
    ["Intent value", current.intentValue, previous.intentValue, change(current.intentValue, previous.intentValue), "money"],
  ];

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/analytics" />
      <AnalyticsNav active="/admin/analytics/comparison" />
      <h1 className={styles.title}>Period comparison</h1>
      <p className={styles.subtitle}>True period-wide qualified visitors and purchase intent compared with the immediately preceding period.</p>
      <form style={{ margin: "18px 0" }}>
        <select name="days" defaultValue={String(days)} style={{ padding: "9px 12px" }}>
          <option value="7">7 days vs previous 7</option>
          <option value="30">30 days vs previous 30</option>
          <option value="90">90 days vs previous 90</option>
        </select>
        <button className={styles.buttonSecondary} style={{ marginLeft: 8 }} type="submit">Apply</button>
      </form>
      <div className={styles.section}>
        <table className={styles.table}>
          <thead><tr><th>Metric</th><th>Current</th><th>Previous</th><th>Change</th></tr></thead>
          <tbody>{rows.map(([label, currentValue, previousValue, delta, format]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{format === "money" ? money.format(currentValue) : currentValue.toLocaleString()}</td>
              <td>{format === "money" ? money.format(previousValue) : previousValue.toLocaleString()}</td>
              <td>{delta}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Conversion-rate comparison</h2></div>
        <table className={styles.table}>
          <thead><tr><th>Rate</th><th>Current</th><th>Previous</th></tr></thead>
          <tbody>
            <tr><td>Impression → product click</td><td>{rate(current.productClicks, current.impressions)}</td><td>{rate(previous.productClicks, previous.impressions)}</td></tr>
            <tr><td>Product view → outbound</td><td>{rate(current.outbound, current.views)}</td><td>{rate(previous.outbound, previous.views)}</td></tr>
            <tr><td>Visitor → outbound shopper</td><td>{rate(current.outboundShoppers, current.visitors)}</td><td>{rate(previous.outboundShoppers, previous.visitors)}</td></tr>
            <tr><td>Session → outbound</td><td>{rate(current.outboundSessions, current.sessions)}</td><td>{rate(previous.outboundSessions, previous.sessions)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
