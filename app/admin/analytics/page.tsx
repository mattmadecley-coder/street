import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { AnalyticsControls } from "@/components/admin/analytics-controls";
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

function metadataString(event: SiteEventRow, key: string) {
  const value = event.metadata?.[key];
  return typeof value === "string" ? value : null;
}

function metadataNumber(event: SiteEventRow, key: string) {
  const value = event.metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function productSlug(event: SiteEventRow) {
  const metadataSlug = metadataString(event, "productSlug");
  if (metadataSlug) return metadataSlug;
  const match = event.path?.match(/^\/products\/([^/?]+)/);
  return match?.[1] ?? event.product_id;
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

function productPerformance(events: SiteEventRow[], outboundClicks: OutboundClickRow[]) {
  const rows = new Map<string, { title: string; brand: string; impressions: number; clicks: number; views: number; outbound: number }>();
  for (const event of events) {
    if (!["product_impression", "product_click", "product_view"].includes(event.event_type)) continue;
    const key = productSlug(event);
    if (!key) continue;
    const row = rows.get(key) ?? { title: metadataString(event, "productTitle") ?? key, brand: event.brand_slug ?? "Unknown", impressions: 0, clicks: 0, views: 0, outbound: 0 };
    if (event.event_type === "product_impression") row.impressions += 1;
    if (event.event_type === "product_click") row.clicks += 1;
    if (event.event_type === "product_view") row.views += 1;
    if (row.title === key) row.title = metadataString(event, "productTitle") ?? row.title;
    rows.set(key, row);
  }
  for (const click of outboundClicks) {
    if (!click.product_slug) continue;
    const row = rows.get(click.product_slug) ?? { title: click.product_slug, brand: click.brand_slug, impressions: 0, clicks: 0, views: 0, outbound: 0 };
    row.outbound += 1;
    rows.set(click.product_slug, row);
  }
  return [...rows.entries()].map(([slug, row]) => ({ slug, ...row })).sort((a, b) => b.impressions - a.impressions || b.views - a.views).slice(0, 30);
}

function brandPerformance(events: SiteEventRow[], outboundClicks: OutboundClickRow[]) {
  const rows = new Map<string, { impressions: number; clicks: number; views: number; outbound: number; sessions: Set<string> }>();
  for (const event of events) {
    if (!event.brand_slug || !["product_impression", "product_click", "product_view"].includes(event.event_type)) continue;
    const row = rows.get(event.brand_slug) ?? { impressions: 0, clicks: 0, views: 0, outbound: 0, sessions: new Set<string>() };
    if (event.event_type === "product_impression") row.impressions += 1;
    if (event.event_type === "product_click") row.clicks += 1;
    if (event.event_type === "product_view") row.views += 1;
    if (event.session_id) row.sessions.add(event.session_id);
    rows.set(event.brand_slug, row);
  }
  for (const click of outboundClicks) {
    const row = rows.get(click.brand_slug) ?? { impressions: 0, clicks: 0, views: 0, outbound: 0, sessions: new Set<string>() };
    row.outbound += 1;
    if (click.session_id) row.sessions.add(click.session_id);
    rows.set(click.brand_slug, row);
  }
  return [...rows.entries()].map(([brand, row]) => ({ brand, ...row, uniqueSessions: row.sessions.size })).sort((a, b) => b.outbound - a.outbound || b.views - a.views).slice(0, 30);
}

function filterDemand(events: SiteEventRow[]) {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.event_type !== "filter_applied" || !event.metadata) continue;
    for (const [key, value] of Object.entries(event.metadata)) {
      if (typeof value !== "string" && typeof value !== "number") continue;
      const label = `${key}: ${value}`;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
}

function retentionSummary(events: SiteEventRow[]) {
  const visitors = new Map<string, { sessions: Set<string>; days: Set<string>; first: string; last: string }>();
  for (const event of [...events].reverse()) {
    if (!event.anonymous_user_id) continue;
    const day = event.created_at.slice(0, 10);
    const row = visitors.get(event.anonymous_user_id) ?? { sessions: new Set<string>(), days: new Set<string>(), first: day, last: day };
    if (event.session_id) row.sessions.add(event.session_id);
    row.days.add(day);
    if (day < row.first) row.first = day;
    if (day > row.last) row.last = day;
    visitors.set(event.anonymous_user_id, row);
  }
  let returning = 0;
  let day1 = 0;
  let day7 = 0;
  let day30 = 0;
  const cohorts = new Map<string, { visitors: number; returned: number }>();
  for (const row of visitors.values()) {
    const elapsed = Math.floor((new Date(row.last).getTime() - new Date(row.first).getTime()) / 86400000);
    const didReturn = row.sessions.size > 1 || row.days.size > 1;
    if (didReturn) returning += 1;
    if (elapsed >= 1) day1 += 1;
    if (elapsed >= 7) day7 += 1;
    if (elapsed >= 30) day30 += 1;
    const cohort = cohorts.get(row.first) ?? { visitors: 0, returned: 0 };
    cohort.visitors += 1;
    if (didReturn) cohort.returned += 1;
    cohorts.set(row.first, cohort);
  }
  return {
    total: visitors.size,
    returning,
    day1,
    day7,
    day30,
    cohorts: [...cohorts.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14),
  };
}

function searchOpportunities(events: SiteEventRow[]) {
  const rows = new Map<string, { searches: number; totalResults: number; zero: number }>();
  for (const event of events) {
    if (event.event_type !== "search" || !event.query) continue;
    const query = event.query.toLowerCase().trim();
    const row = rows.get(query) ?? { searches: 0, totalResults: 0, zero: 0 };
    row.searches += 1;
    row.totalResults += event.results_count ?? 0;
    if (event.results_count === 0) row.zero += 1;
    rows.set(query, row);
  }
  return [...rows.entries()].map(([query, row]) => ({ query, ...row, averageResults: row.searches ? row.totalResults / row.searches : 0 })).filter((row) => row.zero > 0 || row.averageResults <= 5).sort((a, b) => b.searches - a.searches || a.averageResults - b.averageResults).slice(0, 20);
}

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const params = await searchParams;
  const days = [1, 7, 30, 90].includes(Number(params.days)) ? Number(params.days) : 30;
  const since = new Date(Date.now() - Math.max(days, 90) * 86400000).toISOString();
  const [allEvents, allOutboundClicks] = await Promise.all([getRecentSiteEvents(50000, since), getRecentOutboundClicks(50000, since)]);
  const rangeStart = new Date(Date.now() - days * 86400000).toISOString();
  const events = allEvents.filter((event) => event.created_at >= rangeStart);
  const outboundClicks = allOutboundClicks.filter((click) => click.created_at >= rangeStart);

  const sessions = unique(events.map((event) => event.session_id));
  const visitors = unique(events.map((event) => event.anonymous_user_id));
  const productViews = events.filter((event) => event.event_type === "product_view").length;
  const impressions = events.filter((event) => event.event_type === "product_impression").length;
  const productClicks = events.filter((event) => event.event_type === "product_click").length;
  const searches = events.filter((event) => event.event_type === "search");
  const zeroResultSearches = searches.filter((event) => event.results_count === 0).length;
  const productViewSessions = sessionsWith(events, (event) => event.event_type === "product_view");
  const searchSessions = sessionsWith(events, (event) => event.event_type === "search");
  const outboundSessions = new Set(outboundClicks.map((click) => click.session_id).filter(Boolean)).size;
  const engagedSessions = new Set([...events.filter((event) => ["search", "filter_applied", "product_view"].includes(event.event_type)).map((event) => event.session_id).filter(Boolean), ...outboundClicks.map((click) => click.session_id).filter(Boolean)]).size;

  const topSources = topCounts(events.filter((event) => event.event_type === "page_view").map(sourceLabel), 12);
  const topSearches = topCounts(searches.map((event) => event.query?.toLowerCase().trim()), 12);
  const zeroSearches = topCounts(searches.filter((event) => event.results_count === 0).map((event) => event.query?.toLowerCase().trim()), 12);
  const topCategories = topCounts(events.filter((event) => event.event_type === "category_view" || event.event_type === "product_view").map((event) => event.street_category ?? event.street_group), 12);
  const topBrands = topCounts(outboundClicks.map((click) => click.brand_slug), 12);
  const topComponents = topCounts([...events.map((event) => event.source_component), ...outboundClicks.map((click) => click.source_component)], 12);
  const devices = topCounts(events.filter((event) => event.event_type === "page_view").map((event) => event.device_type), 5);
  const sorts = topCounts(events.filter((event) => event.event_type === "sort_changed").map((event) => typeof event.metadata?.sort === "string" ? event.metadata.sort : null), 10);
  const filters = filterDemand(events);
  const products = productPerformance(events, outboundClicks);
  const brands = brandPerformance(events, outboundClicks);
  const retention = retentionSummary(allEvents);
  const searchGaps = searchOpportunities(events);
  const weakDiscovery = products.filter((row) => row.impressions >= 10 && row.clicks / row.impressions < 0.05).slice(0, 15);
  const weakConversion = products.filter((row) => row.views >= 3 && row.outbound === 0).sort((a, b) => b.views - a.views).slice(0, 15);
  const technicalEvents = events.filter((event) => ["javascript_error", "unhandled_rejection", "broken_image"].includes(event.event_type));
  const performanceEvents = events.filter((event) => event.event_type === "page_performance");
  const averageLoad = performanceEvents.length ? Math.round(performanceEvents.reduce((sum, event) => sum + (metadataNumber(event, "loadMs") ?? 0), 0) / performanceEvents.length) : 0;
  const slowPages = performanceEvents.filter((event) => (metadataNumber(event, "loadMs") ?? 0) >= 3000).length;
  const trend = dailyTrend(events, outboundClicks, Math.min(days, 30));
  const maxTrend = Math.max(1, ...trend.map(([, row]) => row.sessions.size));

  return <div className={styles.shell}>
    <AdminNav active="/admin/analytics" />
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16, flexWrap: "wrap" }}>
      <div><h1 className={styles.title}>Analytics</h1><p className={styles.subtitle}>Discovery, retention, inventory demand, technical health, and traffic sent to brands.</p></div>
      <form><label className={styles.rowMeta}>Date range <select name="days" defaultValue={String(days)} style={{ marginLeft: 8, padding: "8px 10px" }}><option value="1">Today</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label><button className={styles.buttonSecondary} style={{ marginLeft: 8, height: 34 }} type="submit">Apply</button></form>
    </div>
    <div style={{ marginTop: 14 }}><AnalyticsControls days={days} /></div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, margin: "24px 0" }}>
      <Metric label="unique visitors" value={visitors.toLocaleString()} />
      <Metric label="sessions" value={sessions.toLocaleString()} />
      <Metric label="engaged sessions" value={engagedSessions.toLocaleString()} note={percent(engagedSessions, sessions)} />
      <Metric label="returning visitors" value={retention.returning.toLocaleString()} note={percent(retention.returning, retention.total)} />
      <Metric label="product impressions" value={impressions.toLocaleString()} />
      <Metric label="product CTR" value={percent(productClicks, impressions)} />
      <Metric label="outbound clicks" value={outboundClicks.length.toLocaleString()} note={`${percent(outboundSessions, sessions)} of sessions`} />
    </div>

    <div className={styles.section}><div className={styles.sectionHead}><h2>Retention</h2></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}><Metric label="returning visitors" value={retention.returning} note={percent(retention.returning, retention.total)} /><Metric label="returned after 1+ day" value={retention.day1} note={percent(retention.day1, retention.total)} /><Metric label="returned after 7+ days" value={retention.day7} note={percent(retention.day7, retention.total)} /><Metric label="returned after 30+ days" value={retention.day30} note={percent(retention.day30, retention.total)} /></div>{retention.cohorts.length ? <table className={styles.table} style={{ marginTop: 16 }}><thead><tr><th>First visit</th><th>Visitors</th><th>Returned</th><th>Return rate</th></tr></thead><tbody>{retention.cohorts.map(([date, row]) => <tr key={date}><td>{date}</td><td>{row.visitors}</td><td>{row.returned}</td><td>{percent(row.returned, row.visitors)}</td></tr>)}</tbody></table> : null}</div>

    <div className={styles.section}><div className={styles.sectionHead}><h2>Discovery → brand funnel</h2></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}><Metric label="sessions" value={sessions} /><Metric label="searched" value={searchSessions} note={percent(searchSessions, sessions)} /><Metric label="saw products" value={impressions} /><Metric label="clicked a product" value={productClicks} note={percent(productClicks, impressions)} /><Metric label="viewed a product" value={productViewSessions} note={percent(productViewSessions, sessions)} /><Metric label="clicked to a brand" value={outboundSessions} note={percent(outboundSessions, sessions)} /></div></div>

    <div className={styles.section}><div className={styles.sectionHead}><h2>Daily sessions</h2></div><div style={{ display: "flex", alignItems: "end", gap: 5, minHeight: 150, overflowX: "auto", paddingTop: 12 }}>{trend.map(([date, row]) => <div key={date} title={`${date}: ${row.sessions.size} sessions, ${row.productViews} product views, ${row.outbound} outbound clicks`} style={{ minWidth: 18, flex: 1, maxWidth: 42, display: "flex", flexDirection: "column", justifyContent: "end", gap: 4 }}><div style={{ height: Math.max(2, (row.sessions.size / maxTrend) * 120), background: "#101010" }} /><span style={{ fontSize: 8, writingMode: "vertical-rl", color: "rgba(16,16,16,.55)" }}>{date.slice(5)}</span></div>)}</div></div>

    <div className={styles.section}><div className={styles.sectionHead}><h2>Inventory opportunities</h2></div><div style={{ overflowX: "auto" }}><table className={styles.table}><thead><tr><th>Search</th><th>Searches</th><th>Zero results</th><th>Average results</th><th>Opportunity</th></tr></thead><tbody>{searchGaps.map((row) => <tr key={row.query}><td>{row.query}</td><td>{row.searches}</td><td>{row.zero}</td><td>{row.averageResults.toFixed(1)}</td><td>{row.zero ? "Missing inventory" : "Low selection"}</td></tr>)}</tbody></table></div></div>

    <div className={styles.section}><div className={styles.sectionHead}><h2>Merchandising alerts</h2></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}><div><h3>Seen but rarely clicked</h3>{weakDiscovery.length ? <table className={styles.table}><thead><tr><th>Product</th><th>Impressions</th><th>CTR</th></tr></thead><tbody>{weakDiscovery.map((row) => <tr key={row.slug}><td>{row.title}</td><td>{row.impressions}</td><td>{percent(row.clicks, row.impressions)}</td></tr>)}</tbody></table> : <p className={styles.rowMeta}>No high-impression weak-click products yet.</p>}</div><div><h3>Viewed but no brand click</h3>{weakConversion.length ? <table className={styles.table}><thead><tr><th>Product</th><th>Views</th><th>Outbound</th></tr></thead><tbody>{weakConversion.map((row) => <tr key={row.slug}><td>{row.title}</td><td>{row.views}</td><td>{row.outbound}</td></tr>)}</tbody></table> : <p className={styles.rowMeta}>No conversion alerts yet.</p>}</div></div></div>

    <div className={styles.section}><div className={styles.sectionHead}><h2>Product performance</h2></div>{products.length ? <div style={{ overflowX: "auto" }}><table className={styles.table}><thead><tr><th>Product</th><th>Brand</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Views</th><th>Outbound</th><th>View → outbound</th></tr></thead><tbody>{products.map((row) => <tr key={row.slug}><td>{row.title}</td><td>{row.brand}</td><td>{row.impressions}</td><td>{row.clicks}</td><td>{percent(row.clicks, row.impressions)}</td><td>{row.views}</td><td>{row.outbound}</td><td>{percent(row.outbound, row.views)}</td></tr>)}</tbody></table></div> : <p className={styles.rowMeta}>Product scorecards begin filling after impression tracking is deployed.</p>}</div>

    <div className={styles.section}><div className={styles.sectionHead}><h2>Brand performance</h2></div>{brands.length ? <div style={{ overflowX: "auto" }}><table className={styles.table}><thead><tr><th>Brand</th><th>Impressions</th><th>Product clicks</th><th>CTR</th><th>Views</th><th>Outbound</th><th>View → outbound</th><th>Unique sessions</th></tr></thead><tbody>{brands.map((row) => <tr key={row.brand}><td>{row.brand}</td><td>{row.impressions}</td><td>{row.clicks}</td><td>{percent(row.clicks, row.impressions)}</td><td>{row.views}</td><td>{row.outbound}</td><td>{percent(row.outbound, row.views)}</td><td>{row.uniqueSessions}</td></tr>)}</tbody></table></div> : <p className={styles.rowMeta}>No brand performance data yet.</p>}</div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
      <CountTable title="Traffic sources" rows={topSources} first="Source / campaign" second="Page views" />
      <CountTable title="Devices" rows={devices} first="Device" second="Page views" />
      <CountTable title="Top searches" rows={topSearches} first="Query" second="Searches" />
      <CountTable title={`Zero-result searches (${zeroResultSearches})`} rows={zeroSearches} first="Missing demand" second="Searches" />
      <CountTable title="Filter demand" rows={filters} first="Filter" second="Uses" />
      <CountTable title="Sort usage" rows={sorts} first="Sort" second="Uses" />
      <CountTable title="Most-browsed categories" rows={topCategories} first="Category" second="Views" />
      <CountTable title="Outbound clicks by brand" rows={topBrands} first="Brand" second="Clicks" />
      <CountTable title="Component performance" rows={topComponents} first="Component" second="Interactions" />
    </div>

    <div className={styles.section}><div className={styles.sectionHead}><h2>Technical health</h2></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 16 }}><Metric label="JS/resource errors" value={technicalEvents.length} /><Metric label="average page load" value={averageLoad ? `${averageLoad} ms` : "—"} /><Metric label="slow page loads" value={slowPages} note="3 seconds or more" /><Metric label="performance samples" value={performanceEvents.length} /></div>{technicalEvents.length ? <table className={styles.table}><thead><tr><th>Type</th><th>Page</th><th>Component</th><th>When</th></tr></thead><tbody>{technicalEvents.slice(0, 20).map((event, index) => <tr key={`${event.created_at}-${index}`}><td>{event.event_type}</td><td>{event.path}</td><td>{event.source_component}</td><td>{new Date(event.created_at).toLocaleString()}</td></tr>)}</tbody></table> : <p className={styles.rowMeta}>No browser or broken-image errors recorded in this range.</p>}</div>

    <div className={styles.section}><div className={styles.sectionHead}><h2>Tracking health</h2></div><table className={styles.table}><tbody><tr><td>Latest event</td><td>{events[0] ? new Date(events[0].created_at).toLocaleString() : "No events"}</td></tr><tr><td>Events in range</td><td>{events.length.toLocaleString()}</td></tr><tr><td>Events missing session ID</td><td>{events.filter((event) => !event.session_id).length.toLocaleString()}</td></tr><tr><td>Zero-result search rate</td><td>{percent(zeroResultSearches, searches.length)}</td></tr><tr><td>Impression → product click rate</td><td>{percent(productClicks, impressions)}</td></tr><tr><td>Product view → outbound rate</td><td>{percent(outboundClicks.length, productViews)}</td></tr></tbody></table></div>
  </div>;
}
