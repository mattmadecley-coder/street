import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { getRecentSiteEvents, getRecentOutboundClicks, type SiteEventRow, type OutboundClickRow } from "@/lib/analytics";

export const dynamic = "force-dynamic";

function topCounts(values: Array<string | null | undefined>, limit = 10) {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function percent(value: number, total: number) {
  return total ? `${((value / total) * 100).toFixed(1)}%` : "0.0%";
}

function sourceLabel(event: SiteEventRow) {
  if (event.utm_source) return event.utm_campaign ? `${event.utm_source} · ${event.utm_campaign}` : event.utm_source;
  if (!event.referrer) return "Direct / unknown";
  try { return new URL(event.referrer).hostname.replace(/^www\./, ""); } catch { return "Direct / unknown"; }
}

function unique(values: Array<string | null>) {
  return new Set(values.filter((value): value is string => Boolean(value))).size;
}

function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div style={{ padding: 18, border: "1px solid rgba(16,16,16,.16)", background: "#fff" }}><p style={{ margin: 0, fontSize: 28, fontWeight: 850, letterSpacing: "-.05em" }}>{value}</p><p className={styles.rowMeta} style={{ margin: "5px 0 0" }}>{label}{note ? ` · ${note}` : ""}</p></div>;
}

function CountTable({ title, rows, first = "Name", second = "Count" }: { title: string; rows: Array<[string, number]>; first?: string; second?: string }) {
  return <div className={styles.section}><div className={styles.sectionHead}><h2>{title}</h2></div>{rows.length ? <table className={styles.table}><thead><tr><th>{first}</th><th>{second}</th></tr></thead><tbody>{rows.map(([name, count]) => <tr key={name}><td>{name}</td><td>{count.toLocaleString()}</td></tr>)}</tbody></table> : <p className={styles.rowMeta}>No data yet.</p>}</div>;
}

function sessionsWith(events: SiteEventRow[], predicate: (event: SiteEventRow) => boolean) {
  return new Set(events.filter(predicate).map((event) => event.session_id).filter(Boolean)).size;
}

function dailyTrend(events: SiteEventRow[], clicks: OutboundClickRow[], days: number) {
  const rows = new Map<string, { sessions: Set<string>; productViews: number; searches: number; outbound: number }>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
    rows.set(date, { sessions: new Set(), productViews: 0, searches: 0, outbound: 0 });
  }
  for (const event of events) {
    const row = rows.get(event.created_at.slice(0, 10));
    if (!row) continue;
    if (event.session_id) row.sessions.add(event.session_id);
    if (event.event_type === "product_view") row.productViews += 1;
    if (event.event_type === "search") row.searches += 1;
  }
  for (const click of clicks) {
    const row = rows.get(click.created_at.slice(0, 10));
    if (row) row.outbound += 1;
  }
  return [...rows.entries()];
}

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const params = await searchParams;
  const days = [1, 7, 30, 90].includes(Number(params.days)) ? Number(params.days) : 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [events, outboundClicks] = await Promise.all([getRecentSiteEvents(20000, since), getRecentOutboundClicks(20000, since)]);

  const sessions = unique(events.map((event) => event.session_id));
  const visitors = unique(events.map((event) => event.anonymous_user_id));
  const productViews = events.filter((event) => event.event_type === "product_view").length;
  const searches = events.filter((event) => event.event_type === "search");
  const zeroResultSearches = searches.filter((event) => event.results_count === 0).length;
  const productViewSessions = sessionsWith(events, (event) => event.event_type === "product_view");
  const searchSessions = sessionsWith(events, (event) => event.event_type === "search");
  const outboundSessions = new Set(outboundClicks.map((click) => click.session_id).filter(Boolean)).size;
  const engagedSessions = new Set([
    ...events.filter((event) => ["search", "filter_applied", "product_view"].includes(event.event_type)).map((event) => event.session_id).filter(Boolean),
    ...outboundClicks.map((click) => click.session_id).filter(Boolean),
  ]).size;

  const topSources = topCounts(events.filter((event) => event.event_type === "page_view").map(sourceLabel), 12);
  const topSearches = topCounts(searches.map((event) => event.query?.toLowerCase().trim()), 12);
  const zeroSearches = topCounts(searches.filter((event) => event.results_count === 0).map((event) => event.query?.toLowerCase().trim()), 12);
  const topCategories = topCounts(events.filter((event) => event.event_type === "category_view" || event.event_type === "product_view").map((event) => event.street_category ?? event.street_group), 12);
  const topBrands = topCounts(outboundClicks.map((click) => click.brand_slug), 12);
  const topComponents = topCounts([...events.map((event) => event.source_component), ...outboundClicks.map((click) => click.source_component)], 12);
  const devices = topCounts(events.filter((event) => event.event_type === "page_view").map((event) => event.device_type), 5);
  const trend = dailyTrend(events, outboundClicks, Math.min(days, 30));
  const maxTrend = Math.max(1, ...trend.map(([, row]) => row.sessions.size));

  return <div className={styles.shell}>
    <AdminNav active="/admin/analytics" />
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16, flexWrap: "wrap" }}>
      <div><h1 className={styles.title}>Analytics</h1><p className={styles.subtitle}>Discovery, engagement, search demand, and traffic sent to brands. First-party visitor and session tracking begins when Analytics v2 is deployed.</p></div>
      <form><label className={styles.rowMeta}>Date range <select name="days" defaultValue={String(days)} style={{ marginLeft: 8, padding: "8px 10px" }}><option value="1">Today</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label><button className={styles.buttonSecondary} style={{ marginLeft: 8, height: 34 }} type="submit">Apply</button></form>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, margin: "24px 0" }}>
      <Metric label="unique visitors" value={visitors.toLocaleString()} />
      <Metric label="sessions" value={sessions.toLocaleString()} />
      <Metric label="engaged sessions" value={engagedSessions.toLocaleString()} note={percent(engagedSessions, sessions)} />
      <Metric label="product views" value={productViews.toLocaleString()} />
      <Metric label="searches" value={searches.length.toLocaleString()} note={`${percent(searchSessions, sessions)} of sessions`} />
      <Metric label="outbound clicks" value={outboundClicks.length.toLocaleString()} note={`${percent(outboundSessions, sessions)} of sessions`} />
    </div>

    <div className={styles.section}>
      <div className={styles.sectionHead}><h2>Discovery → brand funnel</h2></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
        <Metric label="sessions" value={sessions} />
        <Metric label="searched" value={searchSessions} note={percent(searchSessions, sessions)} />
        <Metric label="viewed a product" value={productViewSessions} note={percent(productViewSessions, sessions)} />
        <Metric label="clicked to a brand" value={outboundSessions} note={percent(outboundSessions, sessions)} />
      </div>
    </div>

    <div className={styles.section}>
      <div className={styles.sectionHead}><h2>Daily sessions</h2></div>
      <div style={{ display: "flex", alignItems: "end", gap: 5, minHeight: 150, overflowX: "auto", paddingTop: 12 }}>{trend.map(([date, row]) => <div key={date} title={`${date}: ${row.sessions.size} sessions, ${row.productViews} product views, ${row.outbound} outbound clicks`} style={{ minWidth: 18, flex: 1, maxWidth: 42, display: "flex", flexDirection: "column", justifyContent: "end", gap: 4 }}><div style={{ height: Math.max(2, (row.sessions.size / maxTrend) * 120), background: "#101010" }} /><span style={{ fontSize: 8, writingMode: "vertical-rl", color: "rgba(16,16,16,.55)" }}>{date.slice(5)}</span></div>)}</div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
      <CountTable title="Traffic sources" rows={topSources} first="Source / campaign" second="Page views" />
      <CountTable title="Devices" rows={devices} first="Device" second="Page views" />
      <CountTable title="Top searches" rows={topSearches} first="Query" second="Searches" />
      <CountTable title={`Zero-result searches (${zeroResultSearches})`} rows={zeroSearches} first="Missing demand" second="Searches" />
      <CountTable title="Most-browsed categories" rows={topCategories} first="Category" second="Views" />
      <CountTable title="Outbound clicks by brand" rows={topBrands} first="Brand" second="Clicks" />
      <CountTable title="Component performance" rows={topComponents} first="Component" second="Interactions" />
    </div>

    <div className={styles.section}><div className={styles.sectionHead}><h2>Tracking health</h2></div><table className={styles.table}><tbody><tr><td>Latest event</td><td>{events[0] ? new Date(events[0].created_at).toLocaleString() : "No events"}</td></tr><tr><td>Events in range</td><td>{events.length.toLocaleString()}</td></tr><tr><td>Events missing session ID</td><td>{events.filter((event) => !event.session_id).length.toLocaleString()}</td></tr><tr><td>Zero-result search rate</td><td>{percent(zeroResultSearches, searches.length)}</td></tr><tr><td>Product view → outbound rate</td><td>{percent(outboundClicks.length, productViews)}</td></tr></tbody></table></div>
  </div>;
}
