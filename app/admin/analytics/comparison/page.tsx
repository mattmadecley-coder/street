import styles from "@/app/admin/admin.module.css";
import { AnalyticsNav } from "@/components/admin/analytics-nav";
import { ChangeChip } from "@/components/admin/change-chip";
import { InfoTip } from "@/components/admin/info-tip";
import { Banner, PageHeader } from "@/components/admin/ui";
import { getAdminRange } from "@/lib/admin-range";
import { compareHasNoHistory, loadRangeSnapshot } from "@/lib/analytics-snapshot";
import { describeChange, describeFractionChange, describeRateChange, lowerIsBetter, type ChangeTone } from "@/lib/analytics-change";
import type { WindowStats } from "@/lib/analytics-metrics";
import type { MetricKey } from "@/lib/analytics-glossary";
import { timeZoneLabel } from "@/lib/date-range";
import { requireUser } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compare periods" };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(1)}%`);
const rate = (value: number, total: number) => (total ? `${((value / total) * 100).toFixed(1)}%` : "—");

type Row = { label: string; indent?: boolean; metric?: MetricKey; current: string; previous: string; change: { text: string; tone: ChangeTone } };

export default async function AnalyticsComparisonPage({ searchParams }: { searchParams: Promise<{ range?: string; start?: string; end?: string; compare?: string; days?: string }> }) {
  await requireUser();
  const range = await getAdminRange(await searchParams);
  const snapshot = await loadRangeSnapshot(range);
  const { current } = snapshot;
  const previous: WindowStats | null = snapshot.compare;
  const noHistory = compareHasNoHistory(snapshot);
  const noData = { text: "No prior data", tone: "none" as const };
  const off = { text: "—", tone: "none" as const };

  const count = (label: string, pick: (stats: WindowStats) => number, metric?: MetricKey, indent = false): Row => ({
    label,
    indent,
    metric,
    current: pick(current).toLocaleString(),
    previous: previous ? pick(previous).toLocaleString() : "—",
    change: previous ? (noHistory ? noData : describeChange(pick(current), pick(previous))) : off,
  });

  const rows: Row[] = [
    count("Visitors", (s) => s.visitors, "visitors"),
    count("Engaged visitors", (s) => s.engagedVisitors, "engagedVisitors"),
    count("Sessions", (s) => s.sessions, "sessions"),
    {
      label: "Bounce rate",
      metric: "bounceRate",
      current: pct(current.bounceRate),
      previous: previous ? pct(previous.bounceRate) : "—",
      change: previous ? (noHistory ? noData : lowerIsBetter(describeFractionChange(current.bounceRate, previous.bounceRate))) : off,
    },
    count("Product impressions", (s) => s.impressions, "impressions"),
    count("Product clicks", (s) => s.productClicks, "productClicks"),
    count("Product views", (s) => s.productViews),
    count("Searches", (s) => s.searches),
    count("Bag adds", (s) => s.bagAdds, "bagAdds"),
    count("Outbound clicks", (s) => s.handoffs.total, "outboundClicks"),
    count("Brand visits", (s) => s.handoffs.brandVisits, "brandVisits", true),
    count("Product visits", (s) => s.handoffs.productVisits, "productVisits", true),
    count("Checkout clicks", (s) => s.handoffs.checkoutClicks, "checkoutClicks", true),
    count("High-intent clicks", (s) => s.handoffs.highIntent, "highIntentClicks"),
    count("Outbound shoppers", (s) => s.shoppers, "shoppers"),
    {
      label: "Intent value",
      current: money.format(current.intentValue),
      previous: previous ? money.format(previous.intentValue) : "—",
      change: previous ? (noHistory ? noData : describeChange(current.intentValue, previous.intentValue)) : off,
    },
  ];

  const rateRows = [
    { label: "Impression → product click", metric: "ctr" as MetricKey, cn: current.productClicks, cd: current.impressions, pn: previous?.productClicks ?? 0, pd: previous?.impressions ?? 0 },
    { label: "Product view → outbound click", cn: current.handoffs.total, cd: current.productViews, pn: previous?.handoffs.total ?? 0, pd: previous?.productViews ?? 0 },
    { label: "Visitor → outbound shopper", cn: current.shoppers, cd: current.visitors, pn: previous?.shoppers ?? 0, pd: previous?.visitors ?? 0 },
  ];

  return (
    <div>
      <AnalyticsNav active="/admin/analytics/comparison" />
      <PageHeader
        title="Compare periods"
        subtitle={<>{range.label} ({range.startDateInput === range.endDateInput ? range.startDateInput : `${range.startDateInput} to ${range.endDateInput}`}) in {timeZoneLabel(range.timeZone)}{range.compare ? <> against {range.compare.label}</> : null}.</>}
      />

      {!range.compare ? (
        <Banner tone="info">Comparison is switched off. Open the date picker in the top bar and choose &ldquo;Previous period&rdquo; or &ldquo;Same period last year&rdquo;.</Banner>
      ) : null}
      {noHistory ? (
        <Banner tone="info">Tracking started on {new Date(snapshot.earliestEventMs ?? 0).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: range.timeZone })}, so the comparison period has no data to compare against.</Banner>
      ) : null}
      {snapshot.truncated ? <Banner tone="warn">There is more traffic than the dashboard can load at once, so the oldest events are left out and totals for long ranges may be low. Pick a shorter range for exact numbers.</Banner> : null}
      <p className={styles.basisNote}>These are the same likely-human numbers as Home and Analytics: bots and your own browser are excluded, days follow your reporting time zone, and repeat clicks within 30 minutes count once.{range.inProgress ? " The current range includes today so far, so it is compared with an equally long part of the earlier period." : ""}</p>

      <div className={styles.section}>
        <table className={styles.table}>
          <thead><tr><th scope="col">Metric</th><th scope="col">Current</th><th scope="col">Previous</th><th scope="col">Change</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.indent ? <span className="u-muted">↳ {row.label}</span> : row.label}{row.metric ? <InfoTip metric={row.metric} /> : null}</th>
                <td className={styles.numCell}>{row.current}</td>
                <td className={styles.numCell}>{row.previous}</td>
                <td><ChangeChip text={row.change.text} tone={row.change.tone} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Conversion-rate comparison</h2></div>
        <table className={styles.table}>
          <thead><tr><th scope="col">Rate</th><th scope="col">Current</th><th scope="col">Previous</th><th scope="col">Change</th></tr></thead>
          <tbody>
            {rateRows.map((row) => {
              const change = previous ? (noHistory ? noData : describeRateChange(row.cn, row.cd, row.pn, row.pd)) : off;
              return (
                <tr key={row.label}>
                  <th scope="row">{row.label}{row.metric ? <InfoTip metric={row.metric} /> : null}</th>
                  <td className={styles.numCell}>{rate(row.cn, row.cd)}</td>
                  <td className={styles.numCell}>{previous ? rate(row.pn, row.pd) : "—"}</td>
                  <td><ChangeChip text={change.text} tone={change.tone} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
