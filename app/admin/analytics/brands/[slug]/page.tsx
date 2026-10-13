import styles from "@/app/admin/admin.module.css";
import { AnalyticsNav } from "@/components/admin/analytics-nav";
import { Banner, PageHeader, StatTile } from "@/components/admin/ui";
import { getAnalyticsRowsForBrand } from "@/lib/analytics";
import { getAdminRange } from "@/lib/admin-range";
import { cacheFriendlySinceMs, timeZoneLabel } from "@/lib/date-range";
import { buildWindowStats, inWindow } from "@/lib/analytics-metrics";
import { describeChange } from "@/lib/analytics-change";
import { getBrandBySlug } from "@/lib/catalog-store";
import { requireUser } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

function percent(value: number, total: number) {
  return total ? `${((value / total) * 100).toFixed(1)}%` : "0.0%";
}

export default async function BrandAnalyticsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ range?: string; start?: string; end?: string; compare?: string; days?: string }> }) {
  await requireUser();
  const { slug } = await params;
  const range = await getAdminRange(await searchParams);
  const brand = await getBrandBySlug(slug).catch(() => null);
  const brandName = brand?.name ?? slug;

  const fetchFrom = Math.min(range.startMs, range.compare?.startMs ?? range.startMs);
  // Filtered server-side to this brand: the row cap is shared across every
  // brand, so an unfiltered pull could crowd a smaller brand out of its own report.
  const { events, clicks, truncated } = await getAnalyticsRowsForBrand(slug, new Date(cacheFriendlySinceMs(fetchFrom)).toISOString());

  const currentEvents = inWindow(events, range.startMs, range.endMs);
  const currentClicks = inWindow(clicks, range.startMs, range.endMs);
  const stats = buildWindowStats(currentEvents, currentClicks);
  const previous = range.compare ? buildWindowStats(inWindow(events, range.compare.startMs, range.compare.endMs), inWindow(clicks, range.compare.startMs, range.compare.endMs)) : null;
  const change = (pick: (value: typeof stats) => number) => (previous ? describeChange(pick(stats), pick(previous)) : undefined);

  const products = new Map<string, { impressions: number; clicks: number; views: number; outbound: number }>();
  for (const event of currentEvents) {
    const key = typeof event.metadata?.productSlug === "string" ? event.metadata.productSlug : event.product_id;
    if (!key) continue;
    const row = products.get(key) ?? { impressions: 0, clicks: 0, views: 0, outbound: 0 };
    if (event.event_type === "product_impression") row.impressions += 1;
    if (event.event_type === "product_click") row.clicks += 1;
    if (event.event_type === "product_view") row.views += 1;
    products.set(key, row);
  }
  for (const click of currentClicks) {
    if (!click.product_slug) continue;
    const row = products.get(click.product_slug) ?? { impressions: 0, clicks: 0, views: 0, outbound: 0 };
    row.outbound += 1;
    products.set(click.product_slug, row);
  }
  const topProducts = [...products.entries()].map(([product, row]) => ({ product, ...row })).sort((a, b) => b.outbound - a.outbound || b.views - a.views).slice(0, 25);
  const searchTerms = new Map<string, number>();
  for (const event of currentEvents) if (event.query) searchTerms.set(event.query, (searchTerms.get(event.query) ?? 0) + 1);
  const topSearches = [...searchTerms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);

  return (
    <div>
      <AnalyticsNav active="/admin/analytics" />
      <PageHeader
        title={`${brandName} report`}
        crumbs={[{ label: "Analytics", href: "/admin/analytics" }, { label: brandName }]}
        subtitle={<>{range.label} ({range.startDateInput === range.endDateInput ? range.startDateInput : `${range.startDateInput} to ${range.endDateInput}`}) in {timeZoneLabel(range.timeZone)}{range.compare ? <> · vs {range.compare.label}</> : null}.</>}
      />
      {truncated ? <Banner tone="warn">There is more traffic than the dashboard can load at once, so the oldest events are left out and totals for long ranges may be low.</Banner> : null}

      <div className="adm-tiles">
        <StatTile label="Sessions" metric="sessions" value={stats.sessions.toLocaleString()} change={change((v) => v.sessions)} />
        <StatTile label="Impressions" metric="impressions" value={stats.impressions.toLocaleString()} change={change((v) => v.impressions)} />
        <StatTile label="Product clicks" metric="productClicks" value={stats.productClicks.toLocaleString()} change={change((v) => v.productClicks)} note={`${percent(stats.productClicks, stats.impressions)} CTR`} />
        <StatTile label="Product views" value={stats.productViews.toLocaleString()} change={change((v) => v.productViews)} />
        <StatTile label="Outbound clicks" metric="outboundClicks" value={stats.handoffs.total.toLocaleString()} change={change((v) => v.handoffs.total)} note={`${percent(stats.handoffs.total, stats.productViews)} of views`} />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Top products</h2></div>
        {topProducts.length ? (
          <table className={styles.table}>
            <thead><tr><th scope="col">Product</th><th scope="col">Impressions</th><th scope="col">Clicks</th><th scope="col">CTR</th><th scope="col">Views</th><th scope="col">Outbound</th></tr></thead>
            <tbody>
              {topProducts.map((row) => (
                <tr key={row.product}><td>{row.product}</td><td className={styles.numCell}>{row.impressions}</td><td className={styles.numCell}>{row.clicks}</td><td className={styles.numCell}>{percent(row.clicks, row.impressions)}</td><td className={styles.numCell}>{row.views}</td><td className={styles.numCell}>{row.outbound}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className={styles.rowMeta}>No product data in this range.</p>}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Search terms that led to this brand</h2></div>
        {topSearches.length ? (
          <table className={styles.table}>
            <thead><tr><th scope="col">Search</th><th scope="col">Interactions</th></tr></thead>
            <tbody>{topSearches.map(([term, count]) => <tr key={term}><td>{term}</td><td className={styles.numCell}>{count}</td></tr>)}</tbody>
          </table>
        ) : <p className={styles.rowMeta}>No attributed searches in this range.</p>}
      </div>
    </div>
  );
}
