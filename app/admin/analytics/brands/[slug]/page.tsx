import Link from "next/link";
import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { AnalyticsNav } from "@/components/admin/analytics-nav";
import { getRecentSiteEvents, getRecentOutboundClicks } from "@/lib/analytics";
import { getAnalyticsBrandDailySummaries, summaryNumber } from "@/lib/analytics-summaries";

export const dynamic = "force-dynamic";

function percent(value: number, total: number) {
  return total ? `${((value / total) * 100).toFixed(1)}%` : "0.0%";
}

export default async function BrandAnalyticsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ days?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const days = [7, 30, 90].includes(Number(query.days)) ? Number(query.days) : 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const sinceDay = since.slice(0, 10);
  const [summaries, events, clicks] = await Promise.all([
    getAnalyticsBrandDailySummaries(slug, sinceDay),
    getRecentSiteEvents(10000, since),
    getRecentOutboundClicks(10000, since),
  ]);
  const totals = summaries.reduce((row, day) => ({
    impressions: row.impressions + summaryNumber(day.impressions),
    productClicks: row.productClicks + summaryNumber(day.product_clicks),
    views: row.views + summaryNumber(day.product_views),
    sessions: row.sessions + summaryNumber(day.sessions),
    outbound: row.outbound + summaryNumber(day.outbound_clicks),
  }), { impressions: 0, productClicks: 0, views: 0, sessions: 0, outbound: 0 });
  const brandEvents = events.filter((event) => event.brand_slug === slug);
  const brandClicks = clicks.filter((click) => click.brand_slug === slug);
  const products = new Map<string, { impressions: number; clicks: number; views: number; outbound: number }>();
  for (const event of brandEvents) {
    const key = typeof event.metadata?.productSlug === "string" ? event.metadata.productSlug : event.product_id;
    if (!key) continue;
    const row = products.get(key) ?? { impressions: 0, clicks: 0, views: 0, outbound: 0 };
    if (event.event_type === "product_impression") row.impressions += 1;
    if (event.event_type === "product_click") row.clicks += 1;
    if (event.event_type === "product_view") row.views += 1;
    products.set(key, row);
  }
  for (const click of brandClicks) {
    if (!click.product_slug) continue;
    const row = products.get(click.product_slug) ?? { impressions: 0, clicks: 0, views: 0, outbound: 0 };
    row.outbound += 1;
    products.set(click.product_slug, row);
  }
  const topProducts = [...products.entries()].map(([product, row]) => ({ product, ...row })).sort((a, b) => b.outbound - a.outbound || b.views - a.views).slice(0, 25);
  const searchTerms = new Map<string, number>();
  for (const event of brandEvents) if (event.query) searchTerms.set(event.query, (searchTerms.get(event.query) ?? 0) + 1);
  const topSearches = [...searchTerms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);

  return <div className={styles.shell}>
    <AdminNav active="/admin/analytics" />
    <AnalyticsNav active="/admin/analytics" />
    <p><Link href="/admin/analytics">← Analytics overview</Link></p>
    <h1 className={styles.title}>{slug} report</h1>
    <p className={styles.subtitle}>Daily summary totals with detailed product and attributed-search drilldowns.</p>
    <form style={{ margin: "18px 0" }}><select name="days" defaultValue={String(days)} style={{ padding: "9px 12px" }}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select><button className={styles.buttonSecondary} style={{ marginLeft: 8 }} type="submit">Apply</button></form>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, margin: "22px 0" }}><div className={styles.section}><strong>{totals.sessions}</strong><p>Daily unique sessions</p></div><div className={styles.section}><strong>{totals.impressions}</strong><p>Impressions</p></div><div className={styles.section}><strong>{totals.productClicks}</strong><p>Product clicks · {percent(totals.productClicks, totals.impressions)} CTR</p></div><div className={styles.section}><strong>{totals.views}</strong><p>Product views</p></div><div className={styles.section}><strong>{totals.outbound}</strong><p>Outbound clicks · {percent(totals.outbound, totals.views)} of views</p></div></div>
    <div className={styles.section}><div className={styles.sectionHead}><h2>Top products</h2></div>{topProducts.length ? <table className={styles.table}><thead><tr><th>Product</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Views</th><th>Outbound</th></tr></thead><tbody>{topProducts.map((row) => <tr key={row.product}><td>{row.product}</td><td>{row.impressions}</td><td>{row.clicks}</td><td>{percent(row.clicks, row.impressions)}</td><td>{row.views}</td><td>{row.outbound}</td></tr>)}</tbody></table> : <p className={styles.rowMeta}>No product data yet.</p>}</div>
    <div className={styles.section}><div className={styles.sectionHead}><h2>Search terms that led to this brand</h2></div>{topSearches.length ? <table className={styles.table}><thead><tr><th>Search</th><th>Interactions</th></tr></thead><tbody>{topSearches.map(([term, count]) => <tr key={term}><td>{term}</td><td>{count}</td></tr>)}</tbody></table> : <p className={styles.rowMeta}>No attributed searches yet.</p>}</div>
  </div>;
}
