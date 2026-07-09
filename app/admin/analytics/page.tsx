import Link from "next/link";
import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { getRecentSiteEvents, getRecentOutboundClicks, type SiteEventRow } from "@/lib/analytics";

export const dynamic = "force-dynamic";

function topCounts(values: Array<string | null | undefined>, limit: number) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function referrerHost(referrer: string | null) {
  if (!referrer) return "Direct / unknown";
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return "Direct / unknown";
  }
}

const PRICE_BUCKETS: Array<[number, number, string]> = [
  [0, 50, "$0–50"],
  [50, 100, "$50–100"],
  [100, 150, "$100–150"],
  [150, 200, "$150–200"],
  [200, 300, "$200–300"],
  [300, 500, "$300–500"],
  [500, Infinity, "$500+"],
];

function bucketPrices(events: SiteEventRow[]) {
  const counts = new Map(PRICE_BUCKETS.map(([, , label]) => [label, 0]));
  for (const event of events) {
    if (event.event_type !== "product_view" || event.price == null) continue;
    const price = Number(event.price);
    const bucket = PRICE_BUCKETS.find(([min, max]) => price >= min && price < max);
    if (bucket) counts.set(bucket[2], (counts.get(bucket[2]) ?? 0) + 1);
  }
  return [...counts.entries()];
}

export default async function AdminAnalyticsPage() {
  const [events, outboundClicks] = await Promise.all([getRecentSiteEvents(), getRecentOutboundClicks()]);

  const searches = events.filter((event) => event.event_type === "search");
  const searchClicks = events.filter((event) => event.event_type === "search_click").slice(0, 20);
  const categoryEvents = events.filter((event) => event.event_type === "category_view" || event.event_type === "product_view");
  const pageViews = events.filter((event) => event.event_type === "page_view");

  const topSearches = topCounts(searches.map((event) => event.query?.toLowerCase().trim()), 12);
  const topCategories = topCounts(categoryEvents.map((event) => event.street_category ?? event.street_group), 12);
  const topReferrers = topCounts(pageViews.map((event) => referrerHost(event.referrer)), 10);
  const topOutboundBrands = topCounts(outboundClicks.map((click) => click.brand_slug), 12);
  const priceBuckets = bucketPrices(events);
  const maxPriceCount = Math.max(1, ...priceBuckets.map(([, value]) => value));

  const hasAnyData = events.length > 0 || outboundClicks.length > 0;

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/analytics" />
      <h1 className={styles.title}>Analytics</h1>
      <p className={styles.subtitle}>What people search for, what they click on, and where traffic to brand sites comes from. Based on the most recent {events.length.toLocaleString()} site events and {outboundClicks.length.toLocaleString()} outbound clicks.</p>

      {!hasAnyData ? <p className={styles.notice}>No events yet — this fills in as people use the site. Outbound-click tracking was just repaired (its table hadn&rsquo;t been created), so brand-traffic numbers start from today.</p> : null}

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Top searches</h2></div>
        {topSearches.length ? (
          <table className={styles.table}>
            <thead><tr><th>Query</th><th>Searches</th></tr></thead>
            <tbody>{topSearches.map(([query, n]) => <tr key={query}><td>{query}</td><td>{n}</td></tr>)}</tbody>
          </table>
        ) : <p className={styles.rowMeta}>No searches logged yet.</p>}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Most-browsed categories</h2></div>
        {topCategories.length ? (
          <table className={styles.table}>
            <thead><tr><th>Category</th><th>Views</th></tr></thead>
            <tbody>{topCategories.map(([category, n]) => <tr key={category}><td>{category}</td><td>{n}</td></tr>)}</tbody>
          </table>
        ) : <p className={styles.rowMeta}>No category views logged yet.</p>}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Price ranges people look at</h2></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {priceBuckets.map(([label, n]) => (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "80px 1fr 40px", alignItems: "center", gap: 10, fontSize: 12 }}>
              <span>{label}</span>
              <div style={{ height: 10, background: "rgba(16,16,16,.08)" }}><div style={{ height: "100%", width: `${(n / maxPriceCount) * 100}%`, background: "#101010" }} /></div>
              <span>{n}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Outbound clicks to brands</h2></div>
        {topOutboundBrands.length ? (
          <table className={styles.table}>
            <thead><tr><th>Brand</th><th>Clicks</th></tr></thead>
            <tbody>{topOutboundBrands.map(([brand, n]) => <tr key={brand}><td>{brand}</td><td>{n}</td></tr>)}</tbody>
          </table>
        ) : <p className={styles.rowMeta}>No outbound clicks logged yet.</p>}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Traffic sources</h2></div>
        {topReferrers.length ? (
          <table className={styles.table}>
            <thead><tr><th>Referrer</th><th>Visits</th></tr></thead>
            <tbody>{topReferrers.map(([host, n]) => <tr key={host}><td>{host}</td><td>{n}</td></tr>)}</tbody>
          </table>
        ) : <p className={styles.rowMeta}>No homepage referrer data logged yet.</p>}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Recent search → click</h2></div>
        {searchClicks.length ? (
          <table className={styles.table}>
            <thead><tr><th>Query</th><th>Brand</th><th>Product</th><th>When</th></tr></thead>
            <tbody>
              {searchClicks.map((event, index) => (
                <tr key={index}>
                  <td>{event.query}</td>
                  <td>{event.brand_slug}</td>
                  <td>{event.path ? <Link className={styles.buttonSecondary} style={{ height: "auto", padding: "3px 8px" }} href={event.path}>View</Link> : "—"}</td>
                  <td>{new Date(event.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className={styles.rowMeta}>No search-to-click events logged yet.</p>}
      </div>
    </div>
  );
}
