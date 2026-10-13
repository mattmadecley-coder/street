import styles from "@/app/admin/admin.module.css";
import { AnalyticsNav } from "@/components/admin/analytics-nav";
import { PageHeader } from "@/components/admin/ui";
import { METRIC_GLOSSARY, type MetricKey } from "@/lib/analytics-glossary";

export const metadata = { title: "Metric definitions" };

const LABELS: Record<MetricKey, string> = {
  visitors: "Visitors",
  engagedVisitors: "Engaged visitors",
  sessions: "Sessions",
  bounceRate: "Bounce rate",
  productClicks: "Product clicks",
  outboundClicks: "Outbound clicks",
  highIntentClicks: "High-intent clicks",
  brandVisits: "Brand visits",
  productVisits: "Product visits",
  checkoutClicks: "Checkout clicks",
  bagAdds: "Bag adds",
  shoppers: "Outbound shoppers",
  recordedVisitors: "Recorded visitors (legacy summary)",
  recordedSessions: "Recorded sessions (legacy summary)",
  recordedOutbound: "Recorded outbound (legacy summary)",
  impressions: "Product impressions",
  ctr: "Click-through rate (CTR)",
  zeroResultSearches: "Zero-result searches",
};

const GROUPS: Array<{ title: string; keys: MetricKey[] }> = [
  { title: "Audience", keys: ["visitors", "engagedVisitors", "sessions", "bounceRate"] },
  { title: "Discovery", keys: ["impressions", "productClicks", "ctr", "zeroResultSearches"] },
  { title: "Hand-offs to brands", keys: ["outboundClicks", "brandVisits", "productVisits", "checkoutClicks", "highIntentClicks", "shoppers", "bagAdds"] },
];

export default function MetricGlossaryPage() {
  return (
    <div>
      <AnalyticsNav active="/admin/analytics/glossary" />
      <PageHeader title="Metric definitions" subtitle="One written definition per number. The “i” next to each metric on Home, Analytics and Compare shows the same text." />
      {GROUPS.map((group) => (
        <section key={group.title} className={styles.section}>
          <div className={styles.sectionHead}><h2>{group.title}</h2></div>
          <dl className="adm-glossary">
            {group.keys.map((key) => (
              <div key={key}>
                <dt>{LABELS[key]}</dt>
                <dd>{METRIC_GLOSSARY[key]}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <section className={styles.section}>
        <div className={styles.sectionHead}><h2>How days and comparisons work</h2></div>
        <dl className="adm-glossary">
          <div><dt>Days</dt><dd>A day runs from midnight to midnight in your reporting time zone (Settings). Ranges such as “Last 7 days” are whole calendar days ending today.</dd></div>
          <div><dt>Today and in-progress ranges</dt><dd>Today is compared with the previous day up to the same time. A range that includes today is compared with an equally long slice of the earlier period, so a half-finished day never looks like a drop.</dd></div>
          <div><dt>Likely human</dt><dd>Visitors are counted when they show real engagement, come from social, or stay past a short passive visit. Impossible device signatures and quick passive visits are separated out. Your own admin browser is excluded by default.</dd></div>
          <div><dt>No prior data</dt><dd>Shown instead of a percentage when the comparison period has no recorded traffic, for example before tracking began. It never shows a made-up +100%.</dd></div>
        </dl>
      </section>
    </div>
  );
}
