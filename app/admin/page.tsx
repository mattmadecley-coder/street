import Link from "next/link";
import styles from "./admin.module.css";
import { Banner, Badge, EmptyState, PageHeader, StatTile } from "@/components/admin/ui";
import { hasSupabaseCatalog, supabaseRestPage } from "@/lib/supabase-rest";
import { getBrandSyncStatuses } from "@/lib/catalog-store";
import { getAdminRange } from "@/lib/admin-range";
import { loadRangeSnapshot, compareHasNoHistory, type RangeSnapshot } from "@/lib/analytics-snapshot";
import { loadAlertView } from "@/lib/admin-alerts";
import { describeChange, describeFractionChange, lowerIsBetter } from "@/lib/analytics-change";
import { timeZoneLabel } from "@/lib/date-range";
import { evaluateHealth, worstLevel } from "@/lib/system-health";
import { countFallbackProducts } from "@/lib/classification-requeue";
import { getRecentSiteEvents } from "@/lib/analytics";
import { requireUser } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(1)}%`);

async function count(path: string) {
  if (!hasSupabaseCatalog()) return 0;
  try {
    const result = await supabaseRestPage(path, { from: 0, to: 0 }, { noStore: true });
    return result.total;
  } catch {
    return 0;
  }
}

function changeFor(snapshot: RangeSnapshot, pick: (stats: RangeSnapshot["current"]) => number) {
  if (!snapshot.compare) return undefined;
  if (compareHasNoHistory(snapshot)) return { text: "No prior data", tone: "none" as const };
  return describeChange(pick(snapshot.current), pick(snapshot.compare));
}

export default async function AdminHomePage({ searchParams }: { searchParams: Promise<{ range?: string; start?: string; end?: string; compare?: string; days?: string }> }) {
  await requireUser();
  const range = await getAdminRange(await searchParams);
  const [snapshot, needsReview, pending, products, brands, syncStatuses, alerts, latestEvents, aiFallbackCount] = await Promise.all([
    loadRangeSnapshot(range),
    count("products?select=id&is_active=eq.true&classification_status=eq.needs_review"),
    count("products?select=id&is_active=eq.true&classification_status=eq.pending"),
    count("products?select=id&is_active=eq.true"),
    count("brands?select=id&is_active=eq.true"),
    getBrandSyncStatuses(),
    loadAlertView().catch(() => null),
    getRecentSiteEvents(1),
    countFallbackProducts(),
  ]);

  const { current, compare } = snapshot;
  const noHistory = compareHasNoHistory(snapshot);
  const trendOf = (pick: (point: RangeSnapshot["trend"][number]) => number) => snapshot.trend.map(pick);
  const interruptedSyncs = [...syncStatuses.values()].filter((status) => status.lastStatus === "failed" && status.lastFailureKind !== "protected_storefront").length;
  const actionableAlerts = alerts?.active ?? [];
  const nowMs = Date.now();
  const lastSyncTimes = [...syncStatuses.values()].map((status) => (status.lastSuccessAt ? new Date(status.lastSuccessAt).getTime() : 0)).filter((time) => time > 0);
  const health = evaluateHealth({
    nowMs,
    lastCatalogSyncMs: lastSyncTimes.length ? Math.max(...lastSyncTimes) : null,
    failingImports: interruptedSyncs,
    pendingClassification: pending,
    needsReview,
    aiFallbackCount,
    latestEventMs: latestEvents[0] ? new Date(latestEvents[0].created_at).getTime() : null,
  });
  const healthLevel = worstLevel(health);

  const attention: Array<{ key: string; tone: "danger" | "warn" | "info"; title: string; detail?: string; href: string; action: string }> = [
    ...actionableAlerts.slice(0, 4).map((alert, index) => ({ key: `alert-${index}`, tone: alert.severity === "critical" ? ("danger" as const) : ("warn" as const), title: alert.title, detail: alert.detail, href: alert.href ?? "/admin/analytics/alerts", action: alert.action ?? "View" })),
    ...(needsReview > 0 ? [{ key: "review", tone: "info" as const, title: `${needsReview.toLocaleString()} products need review`, detail: "The AI classifier was not confident about these.", href: "/admin/products?status=needs_review", action: "Review products" }] : []),
    ...(pending > 0 ? [{ key: "pending", tone: "info" as const, title: `${pending.toLocaleString()} products waiting for classification`, href: "/admin/products?status=pending", action: "See queue" }] : []),
    ...(interruptedSyncs > 0 ? [{ key: "sync", tone: "warn" as const, title: `${interruptedSyncs} brand import${interruptedSyncs === 1 ? "" : "s"} interrupted`, href: "/admin/brands", action: "Open Brands" }] : []),
  ];

  const rangeNote = range.inProgress
    ? range.key === "today"
      ? "Today is still in progress, so it is compared with yesterday up to the same time."
      : "This range includes today so far, so it is compared with an equally long part of the earlier period."
    : null;

  return (
    <div>
      <PageHeader
        title="Home"
        subtitle={<>{range.label} · {range.startDateInput === range.endDateInput ? range.startDateInput : `${range.startDateInput} to ${range.endDateInput}`} · {timeZoneLabel(range.timeZone)}{range.compare ? <> · vs {range.compare.label}</> : null}</>}
      />

      {snapshot.truncated ? (
        <Banner tone="warn">There is more traffic than the dashboard can load at once, so the oldest events in this range are left out and totals may be low. Pick a shorter range for exact numbers.</Banner>
      ) : null}
      {noHistory ? <Banner tone="info">Tracking started on {new Date(snapshot.earliestEventMs ?? 0).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: range.timeZone })}, so the comparison period has no data yet.</Banner> : null}
      {rangeNote && !noHistory ? <p className={styles.rowMeta}>{rangeNote}</p> : null}

      <section className="u-mt-14" aria-label="Traffic and hand-offs">
        <div className="adm-tiles">
          <StatTile label="Visitors" metric="visitors" value={current.visitors.toLocaleString()} change={changeFor(snapshot, (s) => s.visitors)} spark={trendOf((p) => p.visitors)} note={`${current.engagedVisitors.toLocaleString()} engaged`} />
          <StatTile label="Sessions" metric="sessions" value={current.sessions.toLocaleString()} change={changeFor(snapshot, (s) => s.sessions)} spark={trendOf((p) => p.sessions)} />
          <StatTile label="Outbound clicks" metric="outboundClicks" value={current.handoffs.total.toLocaleString()} change={changeFor(snapshot, (s) => s.handoffs.total)} spark={trendOf((p) => p.outboundClicks)} note={`${current.handoffs.highIntent.toLocaleString()} high-intent`} />
          <StatTile
            label="Bounce rate"
            metric="bounceRate"
            value={pct(current.bounceRate)}
            change={compare ? (noHistory ? { text: "No prior data", tone: "none" as const } : lowerIsBetter(describeFractionChange(current.bounceRate, compare.bounceRate))) : undefined}
          />
        </div>
        <div className="adm-tiles u-mt-14">
          <StatTile label="Product views" value={current.productViews.toLocaleString()} change={changeFor(snapshot, (s) => s.productViews)} />
          <StatTile label="Searches" value={current.searches.toLocaleString()} change={changeFor(snapshot, (s) => s.searches)} note={`${current.zeroResultSearches.toLocaleString()} found nothing`} />
          <StatTile label="Bag adds" metric="bagAdds" value={current.bagAdds.toLocaleString()} change={changeFor(snapshot, (s) => s.bagAdds)} />
          <StatTile label="Intent value" value={money.format(current.intentValue)} change={changeFor(snapshot, (s) => s.intentValue)} note="Listed price of clicked items, not sales" />
        </div>
      </section>

      <div className={`${styles.section} u-cards-320`}>
        <section className="adm-card" aria-labelledby="attention-title">
          <div className="adm-card-head">
            <h2 id="attention-title">Needs attention</h2>
            {attention.length ? <Badge tone="danger">{attention.length}</Badge> : <Badge tone="success">All clear</Badge>}
          </div>
          {attention.length === 0 ? (
            <EmptyState title="Nothing needs attention">Traffic, catalog syncs and classification are all healthy.</EmptyState>
          ) : (
            <ul className="adm-attention">
              {attention.map((item) => (
                <li key={item.key} data-tone={item.tone}>
                  <div>
                    <strong>{item.title}</strong>
                    {item.detail ? <p>{item.detail}</p> : null}
                  </div>
                  <Link href={item.href} className="adm-btn" data-variant="secondary" data-size="sm">{item.action}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="adm-card" aria-labelledby="brands-title">
          <div className="adm-card-head"><h2 id="brands-title">Top brands by clicks</h2><Link href="/admin/analytics" className={styles.rowMeta}>Analytics →</Link></div>
          <RankedList rows={snapshot.topBrands} empty="No outbound clicks in this range yet." />
          <div className="adm-card-head u-mt-18"><h2>Hand-offs by type</h2></div>
          <dl className="adm-kv">
            <div><dt>Brand visits</dt><dd>{current.handoffs.brandVisits.toLocaleString()}</dd></div>
            <div><dt>Product visits</dt><dd>{current.handoffs.productVisits.toLocaleString()}</dd></div>
            <div><dt>Checkout clicks</dt><dd>{current.handoffs.checkoutClicks.toLocaleString()}</dd></div>
          </dl>
          {current.handoffs.rawTotal > current.handoffs.total ? <p className={`${styles.rowMeta} u-mt-8`}>{(current.handoffs.rawTotal - current.handoffs.total).toLocaleString()} repeat clicks within 30 minutes were counted once.</p> : null}
        </section>

        <section className="adm-card" aria-labelledby="search-title">
          <div className="adm-card-head"><h2 id="search-title">Top searches</h2></div>
          <RankedList rows={snapshot.topSearches} empty="No searches in this range yet." />
          <div className="adm-card-head u-mt-18"><h2>Searches with no results</h2></div>
          <RankedList rows={snapshot.zeroResultSearches} empty="Every search found something." tone="danger" />
        </section>
      </div>

      <section className={styles.section} aria-label="System health">
        <div className={styles.sectionHead}>
          <h2>System health</h2>
          <Badge tone={healthLevel === "ok" ? "success" : healthLevel === "warn" ? "warn" : "danger"}>{healthLevel === "ok" ? "All systems normal" : healthLevel === "warn" ? "Needs a look" : "Action needed"}</Badge>
        </div>
        <ul className="adm-health">
          {health.map((item) => (
            <li key={item.key} data-level={item.level}>
              <span className="adm-health-dot" aria-hidden="true" />
              <div>
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
              </div>
              {item.href ? <Link href={item.href} className={styles.rowMeta}>Open →</Link> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-label="Catalog">
        <div className={styles.sectionHead}><h2>Catalog</h2></div>
        <div className="adm-tiles">
          <StatTile label="Active products" value={products.toLocaleString()} href="/admin/products?status=all" />
          <StatTile label="Brands" value={brands.toLocaleString()} href="/admin/brands" />
          <StatTile label="Need review" value={needsReview.toLocaleString()} href="/admin/products?status=needs_review" />
          <StatTile label="Pending classification" value={pending.toLocaleString()} href="/admin/products?status=pending" />
        </div>
      </section>
    </div>
  );
}

function RankedList({ rows, empty, tone }: { rows: Array<{ label: string; count: number }>; empty: string; tone?: "danger" }) {
  if (!rows.length) return <p className={styles.rowMeta}>{empty}</p>;
  const max = Math.max(...rows.map((row) => row.count));
  return (
    <ol className="adm-ranked">
      {rows.map((row) => (
        <li key={row.label}>
          <span className="adm-ranked-label">{row.label}</span>
          <span className="adm-ranked-bar" data-tone={tone} style={{ "--w": `${Math.max(4, (row.count / max) * 100)}%` } as React.CSSProperties} aria-hidden="true" />
          <span className="adm-ranked-count">{row.count.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}
