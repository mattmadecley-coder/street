import styles from "@/app/admin/admin.module.css";
import { AnalyticsNav } from "@/components/admin/analytics-nav";
import { getCampaignDaily, getPositionDaily, getSearchDaily } from "@/lib/analytics-growth";
import { getAdminRange } from "@/lib/admin-range";
import { rangeUtcDays, timeZoneLabel } from "@/lib/date-range";
import { PageHeader } from "@/components/admin/ui";
import { requireUser } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

const n = (value: number | string) => Number(value) || 0;
const percent = (value: number, total: number) => total ? `${((value / total) * 100).toFixed(1)}%` : "0.0%";

/** The next UTC day after `day` ("YYYY-MM-DD"). */
function nextDay(day: string) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

export default async function GrowthAnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string; start?: string; end?: string; compare?: string; days?: string }> }) {
  await requireUser();
  const range = await getAdminRange(await searchParams);
  const { startDay, endDay } = rangeUtcDays(range);
  // These tables are per UTC day. Include the current day when the range runs up to now.
  const untilDay = range.inProgress ? nextDay(endDay) : endDay;
  const within = <T extends { day: string }>(rows: T[]) => rows.filter((row) => row.day < untilDay);
  const [rawSearchRows, rawCampaignRows, rawPositionRows] = await Promise.all([
    getSearchDaily(startDay),
    getCampaignDaily(startDay),
    getPositionDaily(startDay),
  ]);
  const searchRows = within(rawSearchRows);
  const campaignRows = within(rawCampaignRows);
  const positionRows = within(rawPositionRows);

  const searchMap = new Map<string, { searches: number; zero: number; results: number; clicks: number; outbound: number }>();
  for (const row of searchRows) {
    const value = searchMap.get(row.query) ?? { searches: 0, zero: 0, results: 0, clicks: 0, outbound: 0 };
    value.searches += n(row.searches);
    value.zero += n(row.zero_result_searches);
    value.results += n(row.total_results);
    value.clicks += n(row.search_clicks);
    value.outbound += n(row.outbound_clicks);
    searchMap.set(row.query, value);
  }
  const searches = [...searchMap.entries()].map(([query, row]) => {
    const averageResults = row.searches ? row.results / row.searches : 0;
    const opportunityScore = row.searches * 3 + row.zero * 6 + Math.max(0, 6 - averageResults) * 2 - row.outbound * 2;
    return { query, ...row, averageResults, opportunityScore };
  }).sort((a, b) => b.opportunityScore - a.opportunityScore || b.searches - a.searches);

  const campaignMap = new Map<string, { source: string; medium: string; campaign: string; content: string; visitors: number; sessions: number; views: number; outbound: number; outboundSessions: number }>();
  for (const row of campaignRows) {
    const key = [row.utm_source, row.utm_medium, row.utm_campaign, row.utm_content].join("|");
    const value = campaignMap.get(key) ?? { source: row.utm_source, medium: row.utm_medium, campaign: row.utm_campaign, content: row.utm_content, visitors: 0, sessions: 0, views: 0, outbound: 0, outboundSessions: 0 };
    value.visitors += n(row.visitors);
    value.sessions += n(row.sessions);
    value.views += n(row.product_views);
    value.outbound += n(row.outbound_clicks);
    value.outboundSessions += n(row.outbound_sessions);
    campaignMap.set(key, value);
  }
  const campaigns = [...campaignMap.values()].sort((a, b) => b.outbound - a.outbound || b.sessions - a.sessions).slice(0, 30);

  const positionMap = new Map<string, { component: string; position: number; impressions: number; clicks: number }>();
  for (const row of positionRows) {
    const position = n(row.position);
    const key = `${row.source_component}|${position}`;
    const value = positionMap.get(key) ?? { component: row.source_component, position, impressions: 0, clicks: 0 };
    value.impressions += n(row.impressions);
    value.clicks += n(row.product_clicks);
    positionMap.set(key, value);
  }
  const positions = [...positionMap.values()].sort((a, b) => b.impressions - a.impressions || a.position - b.position).slice(0, 40);

  return <div>
    <AnalyticsNav active="/admin/analytics/growth" />
    <PageHeader
      title="Growth intelligence"
      subtitle={<>Search demand, campaign conversion, product placement, and ranked inventory opportunities for {range.label.toLowerCase()} ({range.startDateInput === range.endDateInput ? range.startDateInput : `${range.startDateInput} to ${range.endDateInput}`}). These tables count whole UTC days, so the first and last day can differ slightly from the {timeZoneLabel(range.timeZone)} figures on Home.</>}
    />

    <div className={styles.section}><div className={styles.sectionHead}><h2>Inventory recommendations</h2></div>{searches.length ? <div className="u-scroll-x"><table className={styles.table}><thead><tr><th>Search</th><th>Demand</th><th>Zero results</th><th>Avg. results</th><th>Search CTR</th><th>Outbound</th><th>Recommendation</th></tr></thead><tbody>{searches.slice(0, 25).map((row) => <tr key={row.query}><td>{row.query}</td><td>{row.searches}</td><td>{row.zero}</td><td>{row.averageResults.toFixed(1)}</td><td>{percent(row.clicks, row.searches)}</td><td>{row.outbound}</td><td>{row.zero > 0 ? "Add matching inventory" : row.averageResults < 6 ? "Expand selection" : row.clicks === 0 ? "Improve relevance" : row.outbound === 0 ? "Review product quality" : "Healthy"}</td></tr>)}</tbody></table></div> : <p className={styles.rowMeta}>Search intelligence will populate as shoppers search.</p>}</div>

    <div className={styles.section}><div className={styles.sectionHead}><h2>Campaign and creator performance</h2></div>{campaigns.length ? <div className="u-scroll-x"><table className={styles.table}><thead><tr><th>Source</th><th>Medium</th><th>Campaign</th><th>Content / creator</th><th>Visitors</th><th>Sessions</th><th>Product views</th><th>Outbound</th><th>Session → outbound</th></tr></thead><tbody>{campaigns.map((row) => <tr key={`${row.source}-${row.medium}-${row.campaign}-${row.content}`}><td>{row.source}</td><td>{row.medium}</td><td>{row.campaign}</td><td>{row.content}</td><td>{row.visitors}</td><td>{row.sessions}</td><td>{row.views}</td><td>{row.outbound}</td><td>{percent(row.outboundSessions, row.sessions)}</td></tr>)}</tbody></table></div> : <p className={styles.rowMeta}>Campaign rows will appear when UTM-tagged traffic arrives.</p>}</div>

    <div className={styles.section}><div className={styles.sectionHead}><h2>Product-position performance</h2></div>{positions.length ? <div className="u-scroll-x"><table className={styles.table}><thead><tr><th>Component</th><th>Position</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Signal</th></tr></thead><tbody>{positions.map((row) => <tr key={`${row.component}-${row.position}`}><td>{row.component}</td><td>{row.position || "Unknown"}</td><td>{row.impressions}</td><td>{row.clicks}</td><td>{percent(row.clicks, row.impressions)}</td><td>{row.impressions >= 20 && row.clicks / Math.max(row.impressions, 1) < 0.03 ? "Weak placement or product" : row.impressions >= 10 && row.clicks / Math.max(row.impressions, 1) >= 0.1 ? "Strong placement" : "Collecting data"}</td></tr>)}</tbody></table></div> : <p className={styles.rowMeta}>Position reporting will populate as product impressions accumulate.</p>}</div>
  </div>;
}
