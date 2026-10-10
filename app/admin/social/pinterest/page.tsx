import styles from "@/app/admin/admin.module.css";
import s from "@/app/admin/social/social.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { SocialChart } from "@/components/admin/social-chart";
import { Alerts, CompareTable, HealthList, Kpi, SocialTabs } from "@/components/admin/social-ui";
import {
  addDays, buildSeries, compareWindows, countByDay, etDay, fmtWhen, getJobs, getSocialPosts, getTraffic, int, n, pct, todayET,
} from "@/lib/social-dashboard";

export const dynamic = "force-dynamic";

export default async function PinterestDashboard() {
  const [all, jobs, traffic] = await Promise.all([getSocialPosts("pinterest"), getJobs(), getTraffic()]);
  const today = todayET();
  const yesterday = addDays(today, -1);
  const when = (p: (typeof all)[number]) => p.scheduled_for ?? p.posted_at;
  const live = all.filter((p) => p.status === "posted");
  const lined = all.filter((p) => p.status === "scheduled" && p.scheduled_for && new Date(p.scheduled_for).getTime() > Date.now()).sort((a, b) => a.scheduled_for!.localeCompare(b.scheduled_for!));
  const failed = all.filter((p) => p.status === "failed");
  const livePerDay = countByDay(live, (p) => etDay(when(p)!));
  const scheduledPerDay = countByDay(all.filter((p) => p.status !== "failed"), (p) => etDay(when(p)!)); // pins whose publish day is that day
  const sessions = traffic.sessions.pinterest;
  const visitors = traffic.visitors.pinterest;
  const outbound = traffic.outbound.pinterest;
  const job = jobs.find((j) => j.job === "pinterest_run");

  const pinViews = all.reduce((a, p) => a + n(p.views), 0);
  const pinSaves = all.reduce((a, p) => a + n(p.saves), 0);
  const pinClicks = all.reduce((a, p) => a + n(p.clicks), 0);
  const haveStats = pinViews + pinSaves + pinClicks > 0;

  // traffic by category (utm_campaign = product category slot) and by day
  const camp = new Map<string, { sessions: number; visitors: number; views: number; outbound: number }>();
  for (const r of traffic.campaigns.filter((c) => c.channel === "pinterest")) {
    const k = r.utm_campaign || "(none)";
    const g = camp.get(k) ?? { sessions: 0, visitors: 0, views: 0, outbound: 0 };
    g.sessions += n(r.sessions); g.visitors += n(r.visitors); g.views += n(r.product_views); g.outbound += n(r.outbound_clicks);
    camp.set(k, g);
  }
  const pinsByCat = new Map<string, number>();
  const pinsByBoard = new Map<string, number>();
  const pinsByBrand = new Map<string, number>();
  for (const p of all) {
    const cat = String(p.meta.category ?? "other");
    pinsByCat.set(cat, (pinsByCat.get(cat) ?? 0) + 1);
    pinsByBoard.set(String(p.meta.board ?? p.series ?? "?"), (pinsByBoard.get(String(p.meta.board ?? p.series ?? "?")) ?? 0) + 1);
    pinsByBrand.set(String(p.meta.brand ?? "?"), (pinsByBrand.get(String(p.meta.brand ?? "?")) ?? 0) + 1);
  }
  const catRows = [...pinsByCat.entries()].map(([cat, pins]) => {
    const t = camp.get(cat) ?? { sessions: 0, visitors: 0, views: 0, outbound: 0 };
    return { cat, pins, ...t, perPin: pins ? t.sessions / pins : 0 };
  }).sort((a, b) => b.sessions - a.sessions || b.pins - a.pins);

  const alerts: Array<{ level: "bad" | "warn" | "info"; text: string }> = [];
  if (job && job.last_status === "failed") alerts.push({ level: "bad", text: `Pinterest scheduler failed: ${job.last_message}` });
  if (job && !lined.length) alerts.push({ level: "warn", text: "No pins are lined up. The 5 AM run schedules the next 10; if this stays empty after 5 AM, the run didn't work (Pinterest may need you to log in again)." });
  if (failed.length) alerts.push({ level: "bad", text: `${failed.length} pin(s) failed to schedule.` });
  if (!haveStats) alerts.push({ level: "info", text: "Per-pin impressions/saves aren't collected yet (the Pinterest API is review-gated). Traffic below is measured on Street itself via utm_source=pinterest, which is the number that matters." });

  const c7 = compareWindows(sessions);
  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/social" />
      <h1 className={styles.title}>Pinterest growth</h1>
      <p className={styles.subtitle}>One clean product pin per product, 10 scheduled each morning across 10 category boards.</p>
      <SocialTabs active="/admin/social/pinterest" />
      <Alerts items={alerts} />

      <div className={s.grid}>
        <Kpi label="Pins publishing today" value={`${n(scheduledPerDay[today])} / 10`} cur={n(scheduledPerDay[today])} prev={n(scheduledPerDay[yesterday])} />
        <Kpi label="Lined up" value={String(lined.length)} note={lined[0] ? `next: ${fmtWhen(lined[0].scheduled_for)}` : "nothing queued"} />
        <Kpi label="Total pins" value={int(all.length)} note={`${live.length} live · ${lined.length} upcoming`} />
        <Kpi label="Visits from Pinterest (7d)" value={int(c7.last7)} cur={c7.last7} prev={c7.prev7} vs="prior 7d" />
        <Kpi label="Outbound clicks (7d)" value={int(compareWindows(outbound).last7)} cur={compareWindows(outbound).last7} prev={compareWindows(outbound).prev7} vs="prior 7d" />
        <Kpi label="Visits per pin" value={all.length ? (compareWindows(sessions).last30 / Math.max(1, live.length)).toFixed(2) : "-"} note="30d sessions / live pins" />
        {haveStats ? <Kpi label="Impressions / saves / clicks" value={`${int(pinViews)} / ${int(pinSaves)} / ${int(pinClicks)}`} /> : null}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Trends</h2></div>
        <div className={s.two}>
          <SocialChart title="Pins published" series={[buildSeries("p", "Pins", livePerDay)]} />
          <SocialChart title="Visits sent to Street" series={[buildSeries("s", "Sessions", sessions), buildSeries("v", "Visitors", visitors), buildSeries("o", "Outbound clicks", outbound)]} />
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Today, this week, this month</h2></div>
        <CompareTable rows={[
          { label: "Pins published", c: compareWindows(livePerDay) }, { label: "Visits to Street", c: compareWindows(sessions) },
          { label: "Visitors", c: compareWindows(visitors) }, { label: "Outbound clicks", c: compareWindows(outbound) },
        ]} />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Which categories bring traffic</h2><p className={styles.rowMeta}>Each pin link is tagged with its category, so this shows what to pin more of</p></div>
        {catRows.length ? (
          <table className={styles.table}>
            <thead><tr><th>Category</th><th>Pins</th><th>Sessions</th><th>Visitors</th><th>Product views</th><th>Outbound</th><th>Sessions / pin</th></tr></thead>
            <tbody>{catRows.map((r) => <tr key={r.cat}><td>{r.cat}</td><td>{r.pins}</td><td>{r.sessions}</td><td>{r.visitors}</td><td>{r.views}</td><td>{r.outbound}</td><td>{r.perPin.toFixed(2)}</td></tr>)}</tbody>
          </table>
        ) : <div className={s.empty}>No pins logged yet.</div>}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Lined up</h2></div>
        {lined.length ? (
          <table className={styles.table}>
            <thead><tr><th>Publishes</th><th>Pin</th><th>Board</th></tr></thead>
            <tbody>{lined.slice(0, 30).map((p) => <tr key={p.external_id}><td>{fmtWhen(p.scheduled_for)}</td><td><div className={s.thumb}>{p.title}</div></td><td>{String(p.meta.board ?? "-")}</td></tr>)}</tbody>
          </table>
        ) : <div className={s.empty}>No pins queued.</div>}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Coverage</h2></div>
        <div className={s.two}>
          <div><h3 style={{ fontSize: 14 }}>Pins per board</h3><div className={s.queue}>{[...pinsByBoard.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k}>{k}: {v}</span>)}</div></div>
          <div><h3 style={{ fontSize: 14 }}>Most-pinned brands</h3><div className={s.queue}>{[...pinsByBrand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => <span key={k}>{k}: {v}</span>)}</div></div>
        </div>
        <p className={s.note} style={{ marginTop: 10 }}>Pins pass a 60-day cooldown before the same product is pinned again. Pin-to-visit rate this month: {live.length ? pct(compareWindows(sessions).last30 / live.length) : "-"} sessions per live pin.</p>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Automation health</h2></div>
        <HealthList jobs={jobs.filter((j) => j.platform === "pinterest" || j.job === "dashboard_sync")} />
      </div>
    </div>
  );
}
