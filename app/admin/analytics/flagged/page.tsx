import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { supabaseRest, supabaseRestPage } from "@/lib/supabase-rest";
import { reactivateBotRuleAction, releaseBotRuleAction, setVisitorFlagAction } from "./actions";
import { listBotRules } from "@/lib/bot-guard";
import { requireUser } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

// How many flagged visitors we fetch per-visitor detail (last/first seen, click
// and event counts) for on this page. Beyond this it's a management list, not
// a dashboard -- rendering every row in full isn't the point and isn't free:
// each row costs 4 round trips to Supabase. Bot bursts can flag thousands of
// visitors in one incident (see 2026-11-22 bot-traffic cleanup), so without a
// cap this page tried to fire 4 * N requests and became unusably slow (or hung)
// the moment N passed a few hundred. Newest-first, so the rows an admin
// actually needs to review (recent activity) are the ones shown.
const DETAIL_ROW_CAP = 200;

type Flag = { anonymous_user_id: string; status: "flagged" | "allowed"; reason: string | null; auto: boolean; clicks_24h: number | null; flagged_at: string; reviewed_at: string | null };
type Ev = { device_type: string | null; browser: string | null; operating_system: string | null; language: string | null; timezone: string | null; created_at: string };

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "-");

export default async function FlaggedVisitorsPage() {
  await requireUser();
  const botRules = await listBotRules();
  const { data: flags, total: totalFlags } = await supabaseRestPage<Flag>(
    `analytics_flagged_visitors?select=*&order=flagged_at.desc`,
    { from: 0, to: DETAIL_ROW_CAP - 1 },
    { noStore: true },
  ).catch(() => ({ data: [] as Flag[], total: 0 }));
  const rows = await Promise.all(flags.map(async (f) => {
    const id = encodeURIComponent(f.anonymous_user_id);
    // last/first seen still need a row each, but clicks/events only need the
    // Content-Range total -- so ask for 1 row (range 0-0) and read the count
    // off the header instead of pulling (and counting) every matching row.
    const [last, first, clicksPage, eventsPage] = await Promise.all([
      supabaseRest<Ev[]>(`site_events?select=device_type,browser,operating_system,language,timezone,created_at&anonymous_user_id=eq.${id}&order=created_at.desc&limit=1`, { noStore: true }).catch(() => [] as Ev[]),
      supabaseRest<Ev[]>(`site_events?select=created_at&anonymous_user_id=eq.${id}&order=created_at.asc&limit=1`, { noStore: true }).catch(() => [] as Ev[]),
      supabaseRestPage<{ id: string }>(`outbound_clicks?select=id&anonymous_user_id=eq.${id}`, { from: 0, to: 0 }, { noStore: true }).catch(() => ({ data: [], total: 0 })),
      supabaseRestPage<{ id: string }>(`site_events?select=id&anonymous_user_id=eq.${id}`, { from: 0, to: 0 }, { noStore: true }).catch(() => ({ data: [], total: 0 })),
    ]);
    return { f, last: last[0], first: first[0], clicks: clicksPage.total, events: eventsPage.total };
  }));

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/analytics" />
      <h1 className={styles.title}>Flagged visitors</h1>
      <p className={styles.subtitle}>
        A visitor is flagged automatically when one browser makes 10 or more outbound clicks in a day, or when they match an automatic bot
        filter below. Flagged visitors are left out of the analytics headline numbers, charts and brand reports. Their activity is kept, so
        you can count them again at any time.
        {totalFlags > DETAIL_ROW_CAP ? ` ${totalFlags.toLocaleString()} visitors are currently flagged; showing the most recent ${DETAIL_ROW_CAP}.` : null}
      </p>
      {botRules.length ? (
        <section className={styles.section}>
          <div className={styles.sectionHead}><div><h2>Automatic bot filters</h2><p className={styles.rowMeta}>When hundreds of &ldquo;visitors&rdquo; arrive at once with the same time zone and screen size, no referrer and one page each, they are crawlers using real browsers. Street spots that pattern, leaves them out of analytics, and keeps their rows so nothing is lost. Filters switch off by themselves after 30 days.</p></div></div>
          <table className={styles.table}>
            <thead><tr><th>Filter</th><th>Why</th><th>Visitors when found</th><th>Found</th><th>Status</th><th /></tr></thead>
            <tbody>
              {botRules.map((rule) => {
                const live = rule.active && Date.parse(rule.expires_at) > Date.now();
                return (
                  <tr key={rule.id}>
                    <td>{rule.label}</td>
                    <td>{rule.reason ?? "-"}</td>
                    <td>{rule.visitors_at_detection?.toLocaleString() ?? "-"}</td>
                    <td>{fmt(rule.created_at)}</td>
                    <td><span className={live ? styles.pillAlert : styles.pill}>{live ? `Excluding until ${fmt(rule.expires_at)}` : rule.released_at ? "Released" : "Expired"}</span></td>
                    <td>
                      <form action={live ? releaseBotRuleAction : reactivateBotRuleAction}>
                        <input type="hidden" name="id" value={rule.id} />
                        <button type="submit">{live ? "Count them again" : "Exclude again"}</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}
      {rows.length === 0 ? <p className={styles.rowMeta}>No flagged visitors.</p> : (
        <table className={styles.table}>
          <thead><tr><th>Visitor</th><th>Device</th><th>Language / timezone</th><th>Clicks</th><th>Events</th><th>First seen</th><th>Last seen</th><th>Why</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map(({ f, last, first, clicks, events }) => (
              <tr key={f.anonymous_user_id}>
                <td title={f.anonymous_user_id}>{f.anonymous_user_id.slice(0, 8)}…</td>
                <td>{[last?.device_type, last?.browser, last?.operating_system].filter(Boolean).join(" / ") || "-"}</td>
                <td>{[last?.language, last?.timezone].filter(Boolean).join(" / ") || "-"}</td>
                <td>{clicks}</td><td>{events}</td>
                <td>{fmt(first?.created_at ?? null)}</td><td>{fmt(last?.created_at ?? null)}</td>
                <td>{f.reason ?? "-"} ({f.auto ? "automatic" : "manual"})</td>
                <td><span className={f.status === "flagged" ? styles.pillAlert : styles.pill}>{f.status === "flagged" ? "Excluded" : "Counted"}</span></td>
                <td>
                  <form action={setVisitorFlagAction}>
                    <input type="hidden" name="visitor" value={f.anonymous_user_id} />
                    <input type="hidden" name="status" value={f.status === "flagged" ? "allowed" : "flagged"} />
                    <button type="submit">{f.status === "flagged" ? "Count again" : "Exclude"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
