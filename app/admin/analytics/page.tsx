import Link from "next/link";
import { estimateWeightedValue, ESTIMATE_WEIGHTS } from "@/lib/analytics-estimated-value";
import styles from "@/app/admin/admin.module.css";
import { AnalyticsControls } from "@/components/admin/analytics-controls";
import { AnalyticsOverviewChart } from "@/components/admin/analytics-overview-chart";
import { getAnalyticsRows, type SiteEventRow, type OutboundClickRow } from "@/lib/analytics";
import { analyzeAudience, buildAnalyticsTrend, summarizePurchaseIntent } from "@/lib/analytics-audience";
import { cacheFriendlySinceMs, timeZoneLabel } from "@/lib/date-range";
import { getAdminRange } from "@/lib/admin-range";
import { buildWindowStats, inWindow } from "@/lib/analytics-metrics";
import { describeChange, describeFractionChange, lowerIsBetter } from "@/lib/analytics-change";
import { Banner, StatTile } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/submit-button";
import { loadAnnotations } from "@/lib/analytics-annotations";
import { addAnnotationAction, deleteAnnotationAction } from "./actions";
import { InfoTip } from "@/components/admin/info-tip";
import { requireUser } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

const ANALYTICS_TABS = [
  { key: "overview", label: "Overview" },
  { key: "audience", label: "Audience" },
  { key: "discovery", label: "Discovery & search" },
  { key: "commerce", label: "Bag & checkout" },
  { key: "catalog", label: "Products & brands" },
  { key: "health", label: "Tracking health" },
] as const;
type AnalyticsTab = (typeof ANALYTICS_TABS)[number]["key"];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

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

function Metric({ label, value, note, featured = false }: { label: string; value: string | number; note?: string; featured?: boolean }) {
  return (
    <div className={styles.analyticsMetricCard} data-featured={featured}>
      <p>{value}</p>
      <span>{label}</span>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function CountTable({ title, rows, first = "Name", second = "Count" }: { title: string; rows: Array<[string, number]>; first?: string; second?: string }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}><h2>{title}</h2></div>
      {rows.length ? (
        <table className={styles.table}>
          <thead><tr><th>{first}</th><th>{second}</th></tr></thead>
          <tbody>{rows.map(([name, count]) => <tr key={name}><td>{name}</td><td>{count.toLocaleString()}</td></tr>)}</tbody>
        </table>
      ) : <p className={styles.rowMeta}>No data yet.</p>}
    </div>
  );
}

function sessionsWith(events: SiteEventRow[], predicate: (event: SiteEventRow) => boolean) {
  return new Set(events.filter(predicate).map((event) => event.session_id).filter(Boolean)).size;
}

function productPerformance(events: SiteEventRow[], outboundClicks: OutboundClickRow[]) {
  const rows = new Map<string, { title: string; brand: string; impressions: number; clicks: number; views: number; outbound: number; intentValue: number }>();
  const valuedIntent = new Set<string>();

  for (const event of events) {
    if (!["product_impression", "product_click", "product_view"].includes(event.event_type)) continue;
    const key = productSlug(event);
    if (!key) continue;
    const row = rows.get(key) ?? { title: metadataString(event, "productTitle") ?? key, brand: event.brand_slug ?? "Unknown", impressions: 0, clicks: 0, views: 0, outbound: 0, intentValue: 0 };
    if (event.event_type === "product_impression") row.impressions += 1;
    if (event.event_type === "product_click") row.clicks += 1;
    if (event.event_type === "product_view") row.views += 1;
    if (row.title === key) row.title = metadataString(event, "productTitle") ?? row.title;
    rows.set(key, row);
  }

  for (const click of outboundClicks) {
    if (!click.product_slug) continue;
    const row = rows.get(click.product_slug) ?? { title: click.product_title ?? click.product_slug, brand: click.brand_slug, impressions: 0, clicks: 0, views: 0, outbound: 0, intentValue: 0 };
    row.outbound += 1;
    row.title = click.product_title ?? row.title;
    const price = Number(click.product_price ?? 0);
    const intentKey = `${click.session_id ?? click.anonymous_user_id ?? "unknown"}::${click.product_slug}`;
    if (price > 0 && !valuedIntent.has(intentKey)) {
      valuedIntent.add(intentKey);
      row.intentValue += price;
    }
    rows.set(click.product_slug, row);
  }

  return [...rows.entries()]
    .map(([slug, row]) => ({ slug, ...row }))
    .sort((a, b) => b.outbound - a.outbound || b.impressions - a.impressions || b.views - a.views)
    .slice(0, 30);
}

function brandPerformance(events: SiteEventRow[], outboundClicks: OutboundClickRow[]) {
  const rows = new Map<string, { impressions: number; clicks: number; views: number; outbound: number; sessions: Set<string>; intentValue: number }>();
  const valuedIntent = new Set<string>();

  for (const event of events) {
    if (!event.brand_slug || !["product_impression", "product_click", "product_view"].includes(event.event_type)) continue;
    const row = rows.get(event.brand_slug) ?? { impressions: 0, clicks: 0, views: 0, outbound: 0, sessions: new Set<string>(), intentValue: 0 };
    if (event.event_type === "product_impression") row.impressions += 1;
    if (event.event_type === "product_click") row.clicks += 1;
    if (event.event_type === "product_view") row.views += 1;
    if (event.session_id) row.sessions.add(event.session_id);
    rows.set(event.brand_slug, row);
  }

  for (const click of outboundClicks) {
    const row = rows.get(click.brand_slug) ?? { impressions: 0, clicks: 0, views: 0, outbound: 0, sessions: new Set<string>(), intentValue: 0 };
    row.outbound += 1;
    if (click.session_id) row.sessions.add(click.session_id);
    const price = Number(click.product_price ?? 0);
    const productKey = click.product_slug ?? click.product_id ?? click.destination_url;
    const intentKey = `${click.session_id ?? click.anonymous_user_id ?? "unknown"}::${productKey}`;
    if (price > 0 && !valuedIntent.has(intentKey)) {
      valuedIntent.add(intentKey);
      row.intentValue += price;
    }
    rows.set(click.brand_slug, row);
  }

  return [...rows.entries()]
    .map(([brand, row]) => ({ brand, ...row, uniqueSessions: row.sessions.size }))
    .sort((a, b) => b.outbound - a.outbound || b.views - a.views)
    .slice(0, 30);
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
  return [...rows.entries()]
    .map(([query, row]) => ({ query, ...row, averageResults: row.searches ? row.totalResults / row.searches : 0 }))
    .filter((row) => row.zero > 0 || row.averageResults <= 5)
    .sort((a, b) => b.searches - a.searches || a.averageResults - b.averageResults)
    .slice(0, 20);
}

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string; start?: string; end?: string; days?: string; compare?: string; tab?: string; annotationError?: string }> }) {
  await requireUser();
  const params = await searchParams;
  // The date range comes from the global picker in the top bar (URL params, then the saved cookie).
  const rangeInfo = await getAdminRange(params);
  const tab: AnalyticsTab = ANALYTICS_TABS.some((item) => item.key === params.tab) ? (params.tab as AnalyticsTab) : "overview";
  const tabHref = (key: AnalyticsTab) => {
    const query = new URLSearchParams();
    for (const name of ["range", "start", "end", "compare"] as const) if (params[name]) query.set(name, params[name] as string);
    if (key !== "overview") query.set("tab", key);
    const text = query.toString();
    return text ? `/admin/analytics?${text}` : "/admin/analytics";
  };

  const now = Date.now();
  // Retention and "all traffic" comparisons below want at least 90 days of
  // history regardless of the selected display range, so always pull back
  // that far and then filter the display-range subset from the same pull.
  const historyDays = Math.max(90, Math.ceil((now - Math.min(rangeInfo.startMs, rangeInfo.compare?.startMs ?? rangeInfo.startMs)) / 86_400_000) + 1);
  const since = new Date(cacheFriendlySinceMs(now - historyDays * 86_400_000)).toISOString();
  const [{ events: allEvents, clicks: allOutboundClicks, truncated }, annotations] = await Promise.all([getAnalyticsRows(since), loadAnnotations()]);
  const notesInRange = annotations.items.filter((note) => note.date >= rangeInfo.startDateInput && note.date <= rangeInfo.endDateInput);
  const rawEvents = allEvents.filter((event) => {
    const at = new Date(event.created_at).getTime();
    return at >= rangeInfo.startMs && at < rangeInfo.endMs;
  });
  const rawOutboundClicks = allOutboundClicks.filter((click) => {
    const at = new Date(click.created_at).getTime();
    return at >= rangeInfo.startMs && at < rangeInfo.endMs;
  });

  const stats = buildWindowStats(rawEvents, rawOutboundClicks);
  const compareStats = rangeInfo.compare
    ? buildWindowStats(inWindow(allEvents, rangeInfo.compare.startMs, rangeInfo.compare.endMs), inWindow(allOutboundClicks, rangeInfo.compare.startMs, rangeInfo.compare.endMs))
    : null;
  const audience = analyzeAudience(rawEvents, rawOutboundClicks);
  const allAudience = analyzeAudience(allEvents, allOutboundClicks);
  const events = rawEvents.filter((event) => Boolean(event.anonymous_user_id && audience.likelyHumanIds.has(event.anonymous_user_id)));
  const outboundClicks = rawOutboundClicks.filter((click) => Boolean(click.anonymous_user_id && audience.likelyHumanIds.has(click.anonymous_user_id)));
  const allQualifiedEvents = allEvents.filter((event) => Boolean(event.anonymous_user_id && allAudience.likelyHumanIds.has(event.anonymous_user_id)));

  const sessions = unique(events.map((event) => event.session_id));
  const visitors = audience.likelyHumanVisitors;
  const productViews = events.filter((event) => event.event_type === "product_view").length;
  const impressions = events.filter((event) => event.event_type === "product_impression").length;
  const productClicks = events.filter((event) => event.event_type === "product_click").length;
  const searches = events.filter((event) => event.event_type === "search");
  const zeroResultSearches = searches.filter((event) => event.results_count === 0).length;
  const productViewSessions = sessionsWith(events, (event) => event.event_type === "product_view");
  const searchSessions = sessionsWith(events, (event) => event.event_type === "search");
  const engagedSessions = new Set([
    ...events.filter((event) => ["search", "filter_applied", "product_view"].includes(event.event_type)).map((event) => event.session_id).filter(Boolean),
    ...outboundClicks.map((click) => click.session_id).filter(Boolean),
  ]).size;

  const intent = summarizePurchaseIntent(outboundClicks);
  const estimatedValue = estimateWeightedValue(events, outboundClicks);
  const weightsNote = `Weighted: click ${ESTIMATE_WEIGHTS.click * 100}% · bag ${ESTIMATE_WEIGHTS.bag * 100}% · checkout ${ESTIMATE_WEIGHTS.checkout * 100}%`;
  const addToCartEvents = events.filter((event) => event.event_type === "add_to_cart");
  const addToCartBlockedEvents = events.filter((event) => event.event_type === "add_to_cart_blocked");
  const checkoutClickEvents = events.filter((event) => event.event_type === "cart_checkout_click");
  const addToCartSessions = sessionsWith(events, (event) => event.event_type === "add_to_cart");
  const checkoutClickSessions = sessionsWith(events, (event) => event.event_type === "cart_checkout_click");
  const checkoutClickShoppers = unique(checkoutClickEvents.map((event) => event.anonymous_user_id));
  const checkoutValuedIntent = new Set<string>();
  let checkoutIntentValue = 0;
  for (const event of checkoutClickEvents) {
    const subtotal = metadataNumber(event, "subtotal") ?? 0;
    const key = `${event.session_id ?? event.anonymous_user_id ?? "unknown"}::${event.brand_slug ?? "unknown"}`;
    if (subtotal > 0 && !checkoutValuedIntent.has(key)) {
      checkoutValuedIntent.add(key);
      checkoutIntentValue += subtotal;
    }
  }
  const checkoutByBrand = topCounts(checkoutClickEvents.map((event) => event.brand_slug), 12);
  const addToCartByBrand = topCounts(addToCartEvents.map((event) => event.brand_slug), 12);
  const trend = buildAnalyticsTrend(rawEvents, rawOutboundClicks, { startMs: rangeInfo.startMs, endMs: rangeInfo.endMs, hourly: rangeInfo.hourly }, audience.likelyHumanIds, rangeInfo.timeZone);
  const compareChange = (pick: (value: typeof stats) => number) => (compareStats ? describeChange(pick(stats), pick(compareStats)) : undefined);
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
  const retention = retentionSummary(allQualifiedEvents);
  const searchGaps = searchOpportunities(events);
  const weakDiscovery = products.filter((row) => row.impressions >= 10 && row.clicks / row.impressions < 0.05).slice(0, 15);
  const weakConversion = products.filter((row) => row.views >= 3 && row.outbound === 0).sort((a, b) => b.views - a.views).slice(0, 15);
  const technicalEvents = events.filter((event) => ["javascript_error", "unhandled_rejection", "broken_image"].includes(event.event_type));
  const performanceEvents = events.filter((event) => event.event_type === "page_performance");
  const averageLoad = performanceEvents.length ? Math.round(performanceEvents.reduce((sum, event) => sum + (metadataNumber(event, "loadMs") ?? 0), 0) / performanceEvents.length) : 0;
  const slowPages = performanceEvents.filter((event) => (metadataNumber(event, "loadMs") ?? 0) >= 3000).length;

  return (
    <div>
      <div className={styles.analyticsPageHead}>
        <div>
          <h1 className={styles.title}>Analytics overview</h1>
          <p className={styles.subtitle}>Qualified audience growth, storefront discovery, and purchase intent sent to brands.</p>
        </div>
      </div>
      <p className={styles.rowMeta}>
        {rangeInfo.label} · {rangeInfo.startDateInput === rangeInfo.endDateInput ? rangeInfo.startDateInput : `${rangeInfo.startDateInput} to ${rangeInfo.endDateInput}`} · {timeZoneLabel(rangeInfo.timeZone)}
        {rangeInfo.compare ? ` · vs ${rangeInfo.compare.label}` : ""}. Change the range with the date picker in the top bar.
      </p>
      {truncated ? <Banner tone="warn">There is more traffic than the dashboard can load at once, so the oldest events are left out and totals for long ranges may be low. Pick a shorter range for exact numbers.</Banner> : null}

      <div className="u-mt-14"><AnalyticsControls range={rangeInfo.key} start={rangeInfo.startDateInput} end={rangeInfo.endDateInput} /></div>

      <div className="adm-tiles u-my-18">
        <StatTile label="Visitors" metric="visitors" value={stats.visitors.toLocaleString()} change={compareChange((v) => v.visitors)} note={`${stats.recordedVisitors.toLocaleString()} raw browser IDs`} />
        <StatTile label="Sessions" metric="sessions" value={stats.sessions.toLocaleString()} change={compareChange((v) => v.sessions)} note={`${percent(stats.engagedSessions, stats.sessions)} engaged`} />
        <StatTile label="Outbound clicks" metric="outboundClicks" value={stats.handoffs.total.toLocaleString()} change={compareChange((v) => v.handoffs.total)} note={`${stats.handoffs.highIntent.toLocaleString()} high-intent · ${stats.handoffs.rawTotal.toLocaleString()} before de-duplication`} />
        <StatTile label="Outbound shoppers" metric="shoppers" value={stats.shoppers.toLocaleString()} change={compareChange((v) => v.shoppers)} note="Unique likely-human visitors" />
        <StatTile label="Bounce rate" metric="bounceRate" value={stats.bounceRate === null ? "—" : `${(stats.bounceRate * 100).toFixed(1)}%`} change={compareStats ? lowerIsBetter(describeFractionChange(stats.bounceRate, compareStats.bounceRate)) : undefined} />
        <StatTile label="Intent value" value={money.format(intent.intentValue)} change={compareChange((v) => v.intentValue)} note="Full listed price of clicked items, not sales" />
        <StatTile label="Estimated value" value={money.format(estimatedValue)} note={weightsNote} />
        <StatTile label="Visitor → outbound" value={percent(stats.shoppers, stats.visitors)} note={`${intent.uniqueProducts} products received intent`} />
      </div>


      <nav className="adm-tabs" aria-label="Analytics views">
        {ANALYTICS_TABS.map((item) => (
          <Link key={item.key} href={tabHref(item.key)} className="adm-tab" aria-current={tab === item.key ? "page" : undefined}>{item.label}</Link>
        ))}
      </nav>

      {tab === "overview" ? (
        <>
      <AnalyticsOverviewChart points={trend} annotations={annotations.items} />

      <section className="adm-card u-mt-14" aria-labelledby="notes-title">
        <div className="adm-card-head"><h2 id="notes-title">Notes on this chart</h2><span className={styles.rowMeta}>Mark launches, drops or outages so spikes make sense later.</span></div>
        {params.annotationError ? <p className={styles.noticeError}>{params.annotationError}</p> : null}
        {!annotations.available ? (
          <p className={styles.rowMeta}>Chart notes switch on after the <code>20261014_admin_state</code> database migration is applied.</p>
        ) : (
          <>
            <form action={addAnnotationAction} className="adm-note-form">
              <input type="hidden" name="return_to" value={tabHref("overview")} />
              <label>Date<input type="date" name="date" defaultValue={rangeInfo.endDateInput} required /></label>
              <label className="adm-note-text">Note<input type="text" name="text" maxLength={80} placeholder="e.g. Broken Planet drop" required /></label>
              <SubmitButton pendingText="Adding…" className="adm-btn" data-size="sm">Add note</SubmitButton>
            </form>
            {notesInRange.length ? (
              <ul className="adm-notes">
                {notesInRange.map((note) => (
                  <li key={note.id}>
                    <span className="adm-notes-date">{note.date}</span>
                    <span>{note.text}</span>
                    <form action={deleteAnnotationAction}>
                      <input type="hidden" name="id" value={note.id} />
                      <input type="hidden" name="return_to" value={tabHref("overview")} />
                      <SubmitButton pendingText="…" className="adm-btn" data-variant="ghost" data-size="sm" aria-label={`Delete note ${note.text}`}>Delete</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            ) : <p className={`${styles.rowMeta} u-mt-8`}>No notes in this date range.</p>}
          </>
        )}
      </section>

      <section className={styles.analyticsQualityCard}>
        <div className={styles.analyticsQualityHead}>
          <div>
            <p className={styles.analyticsEyebrow}>Traffic confidence</p>
            <h2>What Street counts as a visitor</h2>
          </div>
          <p>The overview uses a conservative likely-human count. It keeps social, repeat, and engaged visitors while separating impossible device signatures and passive direct visits shorter than 15 seconds.</p>
        </div>
        <div className={styles.analyticsQualityGrid}>
          <Metric label="Recorded browser IDs" value={audience.recordedVisitors} />
          <Metric label="Likely human" value={audience.likelyHumanVisitors} />
          <Metric label="Social visitors" value={audience.socialVisitors} />
          <Metric label="Engaged visitors" value={audience.engagedVisitors} />
          <Metric label="Suspected automated" value={audience.suspectedAutomatedVisitors} />
          <Metric label="Unqualified short bounces" value={audience.unqualifiedBounces} />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div><h2>Purchase intent</h2><p className={styles.rowMeta}>Intent value adds a product's captured listed price once per shopper session and product. It is not confirmed revenue.</p></div>
        </div>
        <div className={styles.analyticsDetailGrid}>
          <Metric label="Outbound click rows (before de-duplication, product and brand links only)" value={intent.outboundClicks} />
          <Metric label="Unique shoppers" value={intent.uniqueShoppers} />
          <Metric label="Unique intent sessions" value={intent.uniqueSessions} />
          <Metric label="Products with intent" value={intent.uniqueProducts} />
          <Metric label="Priced intent clicks" value={intent.pricedClicks} />
          <Metric label="Intent value" value={money.format(intent.intentValue)} />
          <Metric label="Estimated value" value={money.format(estimatedValue)} note={weightsNote} />
        </div>
        <p className={`${styles.rowMeta} u-mt-10`}>Estimated value weights each shopper + product by the furthest step they reached (clicked through, added to StreetBag, clicked checkout). The percentages are rough industry rules of thumb, not measured Street conversion rates — adjust them in lib/analytics-estimated-value.ts once brands share real sales.</p>
        {intent.topProducts.length ? (
          <div className="u-scroll-x u-mt-18">
            <table className={styles.table}>
              <thead><tr><th>Product</th><th>Brand</th><th>Outbound clicks</th><th>Shoppers</th><th>Intent value</th></tr></thead>
              <tbody>{intent.topProducts.map((row) => <tr key={row.key}><td>{row.title}</td><td>{row.brand}</td><td>{row.clicks}</td><td>{row.shoppers}</td><td>{money.format(row.intentValue)}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className={`${styles.rowMeta} u-mt-16`}>No qualified outbound product clicks in this period yet.</p>}
      </section>
        </>
      ) : null}

      {tab === "audience" ? (
        <>
      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Retention</h2></div>
        <div className={styles.analyticsDetailGrid}>
          <Metric label="Returning visitors" value={retention.returning} note={percent(retention.returning, retention.total)} />
          <Metric label="Returned after 1+ day" value={retention.day1} note={percent(retention.day1, retention.total)} />
          <Metric label="Returned after 7+ days" value={retention.day7} note={percent(retention.day7, retention.total)} />
          <Metric label="Returned after 30+ days" value={retention.day30} note={percent(retention.day30, retention.total)} />
        </div>
        {retention.cohorts.length ? <table className={`${styles.table} u-mt-16`}><thead><tr><th>First visit</th><th>Visitors</th><th>Returned</th><th>Return rate</th></tr></thead><tbody>{retention.cohorts.map(([date, row]) => <tr key={date}><td>{date}</td><td>{row.visitors}</td><td>{row.returned}</td><td>{percent(row.returned, row.visitors)}</td></tr>)}</tbody></table> : null}
      </div>

      <div className="u-cards-300">
        <CountTable title="Traffic sources" rows={topSources} first="Source / campaign" second="Page views" />
        <CountTable title="Devices" rows={devices} first="Device" second="Page views" />
      </div>
        </>
      ) : null}

      {tab === "discovery" ? (
        <>
      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Discovery → brand funnel</h2></div>
        <div className={styles.analyticsDetailGrid}>
          <Metric label="Sessions" value={sessions} />
          <Metric label="Searched" value={searchSessions} note={percent(searchSessions, sessions)} />
          <Metric label="Product impressions" value={impressions} />
          <Metric label="Product clicks" value={productClicks} note={percent(productClicks, impressions)} />
          <Metric label="Product-view sessions" value={productViewSessions} note={percent(productViewSessions, sessions)} />
          <Metric label="Outbound sessions" value={intent.uniqueSessions} note={percent(intent.uniqueSessions, sessions)} />
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Inventory opportunities</h2></div>
        <div className="u-scroll-x"><table className={styles.table}><thead><tr><th>Search</th><th>Searches</th><th>Zero results</th><th>Average results</th><th>Opportunity</th></tr></thead><tbody>{searchGaps.map((row) => <tr key={row.query}><td>{row.query}</td><td>{row.searches}</td><td>{row.zero}</td><td>{row.averageResults.toFixed(1)}</td><td>{row.zero ? "Missing inventory" : "Low selection"}</td></tr>)}</tbody></table></div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Merchandising alerts</h2></div>
        <div className="u-cards-320">
          <div><h3>Seen but rarely clicked</h3>{weakDiscovery.length ? <table className={styles.table}><thead><tr><th>Product</th><th>Impressions</th><th>CTR</th></tr></thead><tbody>{weakDiscovery.map((row) => <tr key={row.slug}><td>{row.title}</td><td>{row.impressions}</td><td>{percent(row.clicks, row.impressions)}</td></tr>)}</tbody></table> : <p className={styles.rowMeta}>No high-impression weak-click products yet.</p>}</div>
          <div><h3>Viewed but no outbound click</h3>{weakConversion.length ? <table className={styles.table}><thead><tr><th>Product</th><th>Views</th><th>Outbound</th></tr></thead><tbody>{weakConversion.map((row) => <tr key={row.slug}><td>{row.title}</td><td>{row.views}</td><td>{row.outbound}</td></tr>)}</tbody></table> : <p className={styles.rowMeta}>No conversion alerts yet.</p>}</div>
        </div>
      </div>

      <div className="u-cards-300">
        <CountTable title="Top searches" rows={topSearches} first="Query" second="Searches" />
        <CountTable title={`Zero-result searches (${zeroResultSearches})`} rows={zeroSearches} first="Missing demand" second="Searches" />
        <CountTable title="Filter demand" rows={filters} first="Filter" second="Uses" />
        <CountTable title="Sort usage" rows={sorts} first="Sort" second="Uses" />
        <CountTable title="Most-browsed categories" rows={topCategories} first="Category" second="Views" />
        <CountTable title="Component performance" rows={topComponents} first="Component" second="Interactions" />
      </div>
        </>
      ) : null}

      {tab === "commerce" ? (
        <>
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div><h2>StreetBag funnel</h2><p className={styles.rowMeta}>Shoppers who save items to their bag across brands before checking out, separate from a direct "Buy Now" click. Checkout clicks are higher intent than any other action Street measures.</p></div>
        </div>
        <div className={styles.analyticsDetailGrid}>
          <Metric label="Added to StreetBag" value={addToCartEvents.length} note={`${addToCartSessions.toLocaleString()} sessions`} />
          <Metric label="Blocked (needs variant)" value={addToCartBlockedEvents.length} />
          <Metric label="Checkout clicks" value={checkoutClickEvents.length} note={`${checkoutClickSessions.toLocaleString()} sessions`} featured />
          <Metric label="Unique checkout shoppers" value={checkoutClickShoppers} />
          <Metric label="Bag → checkout rate" value={percent(checkoutClickSessions, addToCartSessions)} note="Sessions that added a bag item and then clicked checkout" />
          <Metric label="Checkout intent value" value={money.format(checkoutIntentValue)} note="Bag subtotal at click, once per session/brand" />
        </div>
        <div className="u-cards-300 u-mt-18">
          <CountTable title="Added to StreetBag by brand" rows={addToCartByBrand} first="Brand" second="Add to bag" />
          <CountTable title="Checkout clicks by brand" rows={checkoutByBrand} first="Brand" second="Checkout clicks" />
        </div>
      </section>

      <div className="u-cards-300 u-mt-18">
        <CountTable title="Outbound clicks by brand" rows={topBrands} first="Brand" second="Clicks" />
      </div>
        </>
      ) : null}

      {tab === "catalog" ? (
        <>
      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Product performance</h2></div>
        {products.length ? <div className="u-scroll-x"><table className={styles.table}><thead><tr><th>Product</th><th>Brand</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Views</th><th>Outbound</th><th>Intent value</th><th>View → outbound</th></tr></thead><tbody>{products.map((row) => <tr key={row.slug}><td>{row.title}</td><td>{row.brand}</td><td>{row.impressions}</td><td>{row.clicks}</td><td>{percent(row.clicks, row.impressions)}</td><td>{row.views}</td><td>{row.outbound}</td><td>{money.format(row.intentValue)}</td><td>{percent(row.outbound, row.views)}</td></tr>)}</tbody></table></div> : <p className={styles.rowMeta}>Product scorecards begin filling after qualified traffic arrives.</p>}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Brand performance</h2></div>
        {brands.length ? <div className="u-scroll-x"><table className={styles.table}><thead><tr><th>Brand</th><th>Impressions</th><th>Product clicks</th><th>CTR</th><th>Views</th><th>Outbound</th><th>Intent value</th><th>View → outbound</th><th>Unique sessions</th></tr></thead><tbody>{brands.map((row) => <tr key={row.brand}><td>{row.brand}</td><td>{row.impressions}</td><td>{row.clicks}</td><td>{percent(row.clicks, row.impressions)}</td><td>{row.views}</td><td>{row.outbound}</td><td>{money.format(row.intentValue)}</td><td>{percent(row.outbound, row.views)}</td><td>{row.uniqueSessions}</td></tr>)}</tbody></table></div> : <p className={styles.rowMeta}>No qualified brand performance data yet.</p>}
      </div>
        </>
      ) : null}

      {tab === "health" ? (
        <>
      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Technical health</h2></div>
        <div className={styles.analyticsDetailGrid}>
          <Metric label="JS/resource errors" value={technicalEvents.length} />
          <Metric label="Average page load" value={averageLoad ? `${averageLoad} ms` : "—"} />
          <Metric label="Slow page loads" value={slowPages} note="3 seconds or more" />
          <Metric label="Performance samples" value={performanceEvents.length} />
        </div>
        {technicalEvents.length ? <table className={`${styles.table} u-mt-16`}><thead><tr><th>Type</th><th>Page</th><th>Component</th><th>When</th></tr></thead><tbody>{technicalEvents.slice(0, 20).map((event, index) => <tr key={`${event.created_at}-${index}`}><td>{event.event_type}</td><td>{event.path}</td><td>{event.source_component}</td><td>{new Date(event.created_at).toLocaleString()}</td></tr>)}</tbody></table> : <p className={`${styles.rowMeta} u-mt-16`}>No browser or broken-image errors recorded for qualified traffic in this range.</p>}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Tracking health and audit</h2></div>
        <table className={styles.table}><tbody>
          <tr><td>Latest raw event</td><td>{rawEvents[0] ? new Date(rawEvents[0].created_at).toLocaleString() : "No events"}</td></tr>
          <tr><td>Raw events in range</td><td>{rawEvents.length.toLocaleString()}</td></tr>
          <tr><td>Qualified events in range</td><td>{events.length.toLocaleString()}</td></tr>
          <tr><td>Recorded browser IDs</td><td>{audience.recordedVisitors.toLocaleString()}</td></tr>
          <tr><td>Likely-human visitors</td><td>{audience.likelyHumanVisitors.toLocaleString()}</td></tr>
          <tr><td>Suspected automated IDs</td><td>{audience.suspectedAutomatedVisitors.toLocaleString()}</td></tr>
          <tr><td>Unqualified short bounces</td><td>{audience.unqualifiedBounces.toLocaleString()}</td></tr>
          <tr><td>Events missing session ID</td><td>{rawEvents.filter((event) => !event.session_id).length.toLocaleString()}</td></tr>
          <tr><td>Zero-result search rate</td><td>{percent(zeroResultSearches, searches.length)}</td></tr>
          <tr><td>Impression → product click rate</td><td>{percent(productClicks, impressions)}</td></tr>
          <tr><td>Product view → outbound rate</td><td>{percent(intent.outboundClicks, productViews)}</td></tr>
        </tbody></table>
      </div>
        </>
      ) : null}
    </div>
  );
}
