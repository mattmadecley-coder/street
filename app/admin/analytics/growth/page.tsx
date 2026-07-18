import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { AnalyticsNav } from "@/components/admin/analytics-nav";
import { getCampaignDaily, getPositionDaily, getSearchDaily } from "@/lib/analytics-growth";

export const dynamic = "force-dynamic";

const n = (value: number | string) => Number(value) || 0;
const percent = (value: number, total: number) => total ? `${((value / total) * 100).toFixed(1)}%` : "0.0%";

export default async function GrowthAnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const params = await searchParams;
  const days = [7, 30, 90].includes(Number(params.days)) ? Number(params.days) : 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [searchRows, campaignRows, positionRows] = await Promise.all([
    getSearchDaily(since),
    getCampaignDaily(since),
    getPositionDaily(since),
  ]);

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

  return <div className={styles.shell}>
    <AdminNav active="/admin/analytics" />
    <AnalyticsNav active="/admin/analytics/growth" />
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16, flexWrap: "wrap" }}>
      <div><h1 className={styles.title}>Growth intelligence</h1><p className={styles.subtitle}>Search demand, campaign conversion, product placement, and ranked inventory opportunities.</p></div>
      <form><select name="days" defaultValue={String(days)} style={{ padding: "9px 12px" }}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select><button className={styles.buttonSecondary} style={{ marginLeft: 8 }} type="submit">Apply</button></form>
    </div>

    <div className={styles.section}><div className={styles.sectionHead}><h2>Inventory recommendations</h2></div>{searches.length ? <div style={{ overflowX: "auto" }}><table className={styles.table}><thead><tr><th>Search</th><th>Demand</th><th>Zero results</th><th>Avg. results</th><th>Search CTR</th><th>Outbound</th><th>Recommendation</th></tr></thead><tbody>{searches.slice(0, 25).map((row) => <tr key={row.query}><td>{row.query}</td><td>{row.searches}</td><td>{row.zero}</td><td>{row.averageResults.toFixed(1)}</td><td>{percent(row.clicks, row.searches)}</td><td>{row.outbound}</td><td>{row.zero > 0 ? "Add matching inventory" : row.averageResults < 6 ? "Expand selection" : row.clicks === 0 ? "Improve relevance" : row.outbound === 0 ? "Review product quality" : "Healthy"}</td></tr>)}</tbody></table></div> : <p className={styles.rowMeta}>Search intelligence will populate as shoppers search.</p>}</div>

    <div className={styles.section}><div className={styles.sectionHead}><h2>Campaign and creator performance</h2></div>{campaigns.length ? <div style={{ overflowX: "auto" }}><table className={styles.table}><thead><tr><th>Source</th><th>Medium</th><th>Campaign</th><th>Content / creator</th><th>Visitors</th><th>Sessions</th><th>Product views</th><th>Outbound</th><th>Session → outbound</th></tr></thead><tbody>{campaigns.map((row) => <tr key={`${row.source}-${row.medium}-${row.campaign}-${row.content}`}><td>{row.source}</td><td>{row.medium}</td><td>{row.campaign}</td><td>{row.content}</td><td>{row.visitors}</td><td>{row.sessions}</td><td>{row.views}</td><td>{row.outbound}</td><td>{percent(row.outboundSessions, row.sessions)}</td></tr>)}</tbody></table></div> : <p className={styles.rowMeta}>Campaign rows will appear when UTM-tagged traffic arrives.</p>}</div>

    <div className={styles.section}><div className={styles.sectionHead}><h2>Product-position performance</h2></div>{positions.length ? <div style={{ overflowX: "auto" }}><table className={styles.table}><thead><tr><th>Component</th><th>Position</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Signal</th></tr></thead><tbody>{positions.map((row) => <tr key={`${row.component}-${row.position}`}><td>{row.component}</td><td>{row.position || "Unknown"}</td><td>{row.impressions}</td><td>{row.clicks}</td><td>{percent(row.clicks, row.impressions)}</td><td>{row.impressions >= 20 && row.clicks / Math.max(row.impressions, 1) < 0.03 ? "Weak placement or product" : row.impressions >= 10 && row.clicks / Math.max(row.impressions, 1) >= 0.1 ? "Strong placement" : "Collecting data"}</td></tr>)}</tbody></table></div> : <p className={styles.rowMeta}>Position reporting will populate as product impressions accumulate.</p>}</div>
  </div>;
}
