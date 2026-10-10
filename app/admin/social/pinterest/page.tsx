import styles from "@/app/admin/admin.module.css";
import s from "@/app/admin/social/social.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { SocialChart } from "@/components/admin/social-chart";
import { TodayChart } from "@/components/admin/social-today-chart";
import { Alerts, CompareTable, HealthList, Kpi, Meter, SectionTitle, SocialTabs, TodayHero } from "@/components/admin/social-ui";
import {
  CHANNEL_COLOR, addDays, buildSeries, compareWindows, countByDay, etDay, fmtWhen, getJobs, getSocialPosts, getTraffic, int, lastNDays, n, nowStamp, todayET, todaySummary,
} from "@/lib/social-dashboard";

export const dynamic = "force-dynamic";
const C = CHANNEL_COLOR.pinterest;
const TARGET = 10;

export default async function PinterestDashboard() {
  const [all, jobs, traffic] = await Promise.all([getSocialPosts("pinterest"), getJobs(), getTraffic()]);
  const today = todayET();
  const yesterday = addDays(today, -1);
  const when = (p: (typeof all)[number]) => p.scheduled_for ?? p.posted_at;
  const live = all.filter((p) => p.status === "posted");
  const lined = all.filter((p) => p.status === "scheduled" && p.scheduled_for && new Date(p.scheduled_for).getTime() > Date.now()).sort((a, b) => a.scheduled_for!.localeCompare(b.scheduled_for!));
  const failed = all.filter((p) => p.status === "failed");
  const publishPerDay = countByDay(all.filter((p) => p.status !== "failed"), (p) => etDay(when(p)!)); // pins by their publish day
  const livePerDay = countByDay(live, (p) => etDay(when(p)!));
  const sessions = traffic.sessions.pinterest;
  const visitors = traffic.visitors.pinterest;
  const outbound = traffic.outbound.pinterest;
  const job = jobs.find((j) => j.job === "pinterest_run");
  const t = todaySummary(traffic, "pinterest");
  const pubToday = n(publishPerDay[today]);

  const pinViews = all.reduce((a, p) => a + n(p.views), 0);
  const pinSaves = all.reduce((a, p) => a + n(p.saves), 0);
  const pinClicks = all.reduce((a, p) => a + n(p.clicks), 0);
  const haveStats = pinViews + pinSaves + pinClicks > 0;

  // which categories bring traffic (each pin link carries utm_campaign = its category)
  const camp = new Map<string, { sessions: number; clicks: number }>();
  for (const v of traffic.visits.filter((x) => x.ch === "pinterest")) { const k = v.campaign || "(untagged)"; const g = camp.get(k) ?? { sessions: 0, clicks: 0 }; g.sessions += 1; camp.set(k, g); }
  for (const c of traffic.clicks.filter((x) => x.ch === "pinterest")) { const k = c.campaign || "(untagged)"; const g = camp.get(k) ?? { sessions: 0, clicks: 0 }; g.clicks += 1; camp.set(k, g); }
  const pinsBy = (key: (p: (typeof all)[number]) => string) => { const m = new Map<string, number>(); for (const p of all) m.set(key(p), (m.get(key(p)) ?? 0) + 1); return m; };
  const pinsByCat = pinsBy((p) => String(p.meta.category ?? "other"));
  const pinsByBoard = pinsBy((p) => String(p.meta.board ?? p.series ?? "?"));
  const pinsByBrand = pinsBy((p) => String(p.meta.brand ?? "?"));
  const catRows = [...pinsByCat.entries()].map(([cat, pins]) => {
    const g = camp.get(cat) ?? { sessions: 0, clicks: 0 };
    return { cat, pins, ...g, perPin: pins ? g.sessions / pins : 0 };
  }).sort((a, b) => b.sessions - a.sessions || b.pins - a.pins);

  const alerts: Array<{ level: "bad" | "warn" | "info"; text: string }> = [];
  if (job?.last_status === "failed") alerts.push({ level: "bad", text: `Pinterest scheduler failed: ${job.last_message}` });
  if (job && !lined.length) alerts.push({ level: "warn", text: "No pins are lined up. The 5 AM run schedules the next 10. If this is still empty after 5 AM, the run didn't work and Pinterest may need you to log in again." });
  if (failed.length) alerts.push({ level: "bad", text: `${failed.length} pin(s) failed to schedule.` });
  if (!haveStats) alerts.push({ level: "info", text: "Per-pin impressions and saves aren't collected yet. Visits below are measured on Street itself through utm_source=pinterest, which is the number that matters." });

  const c7 = compareWindows(sessions);
  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/social" />
      <div className={s.head}>
        <div><h1 className={styles.title}>Pinterest</h1><p className={styles.subtitle}>One clean product pin per product, 10 scheduled each morning across 10 category boards.</p></div>
        <div className={s.stamp}>Eastern time · as of {nowStamp()}</div>
      </div>
      <SocialTabs active="/admin/social/pinterest" />

      <div className={s.todayGrid}>
        <TodayHero
          label="Visits from Pinterest today" value={t.visits} prevAtNow={t.prevAtNow} yesterdayTotal={t.yesterday} nowLabel={nowStamp()}
          rows={[["Clicks out to brands", `${t.clicks} (yesterday ${t.clicksYesterday})`], ["Pins publishing today", `${pubToday} of ${TARGET}`], ["Next pin", lined[0] ? fmtWhen(lined[0].scheduled_for) : "none queued"]]}
        />
        <TodayChart title="Pinterest visits through the day" lines={[{ key: "pin", label: "Pinterest", color: C, today: t.todayCum }]} yesterday={t.yesterdayCum} />
      </div>

      <div className={s.grid} style={{ marginTop: 14 }}>
        <div className={s.kpi}>
          <span>Pins publishing today</span><strong>{pubToday} <small style={{ fontSize: 15, fontWeight: 400 }}>of {TARGET}</small></strong>
          <Meter value={pubToday} max={TARGET} color={C} />
          <small>{n(publishPerDay[yesterday])} yesterday</small>
        </div>
        <Kpi label="Pins lined up" value={String(lined.length)} note={lined[0] ? `next: ${fmtWhen(lined[0].scheduled_for)}` : "nothing queued"} />
        <Kpi label="Visits, last 7 days" value={int(c7.last7)} cur={c7.last7} prev={c7.prev7} vs="the 7 before" spark={lastNDays(sessions)} color={C} />
        <Kpi label="Clicks out, last 7 days" value={int(compareWindows(outbound).last7)} cur={compareWindows(outbound).last7} prev={compareWindows(outbound).prev7} vs="the 7 before" spark={lastNDays(outbound)} color={C} />
        <Kpi label="Total pins" value={int(all.length)} note={`${live.length} live · ${lined.length} upcoming`} />
        {haveStats ? <Kpi label="Impressions · saves · clicks" value={`${int(pinViews)} · ${int(pinSaves)} · ${int(pinClicks)}`} /> : null}
      </div>

      <SectionTitle title="Needs attention" hint={alerts.length ? `${alerts.length} item${alerts.length === 1 ? "" : "s"}` : undefined} />
      <Alerts items={alerts} />

      <SectionTitle title="Trends" />
      <div className={s.two}>
        <SocialChart title="Pins published" series={[buildSeries("p", "Pins", livePerDay, "sum", "int", C)]} height={210} />
        <SocialChart title="Visits sent to Street" series={[buildSeries("s", "Visits", sessions, "sum", "int", C), buildSeries("v", "Visitors", visitors, "sum", "int", C), buildSeries("o", "Clicks out", outbound, "sum", "int", C)]} height={210} />
      </div>
      <div style={{ marginTop: 14 }}>
        <CompareTable rows={[
          { label: "Pins published", c: compareWindows(livePerDay) }, { label: "Visits to Street", c: compareWindows(sessions) },
          { label: "Visitors", c: compareWindows(visitors) }, { label: "Clicks out", c: compareWindows(outbound) },
        ]} />
      </div>

      <SectionTitle title="Which categories bring traffic" hint="Each pin link is tagged with its category, so this shows what to pin more of" />
      {catRows.length ? (
        <div className={s.panel}><table className={styles.table}>
          <thead><tr><th>Category</th><th>Pins</th><th>Visits</th><th>Clicks out</th><th>Visits per pin</th></tr></thead>
          <tbody>{catRows.map((r) => <tr key={r.cat}><td>{r.cat}</td><td>{r.pins}</td><td><b>{r.sessions}</b></td><td>{r.clicks}</td><td>{r.perPin.toFixed(2)}</td></tr>)}</tbody>
        </table></div>
      ) : <div className={s.empty}>No pins logged yet.</div>}

      <SectionTitle title="Lined up" />
      {lined.length ? (
        <div className={s.panel}><table className={styles.table}>
          <thead><tr><th>Publishes</th><th>Pin</th><th>Board</th></tr></thead>
          <tbody>{lined.slice(0, 30).map((p) => <tr key={p.external_id}><td>{fmtWhen(p.scheduled_for)}</td><td><div className={s.thumb}>{p.title}</div></td><td>{String(p.meta.board ?? "-")}</td></tr>)}</tbody>
        </table></div>
      ) : <div className={s.empty}>No pins queued.</div>}

      <SectionTitle title="Coverage" hint="Products are pinned again only after a 60-day cooldown" />
      <div className={s.two}>
        <div><h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Pins per board</h3><div className={s.queue}>{[...pinsByBoard.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k}>{k}: {v}</span>)}</div></div>
        <div><h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Most-pinned brands</h3><div className={s.queue}>{[...pinsByBrand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => <span key={k}>{k}: {v}</span>)}</div></div>
      </div>

      <SectionTitle title="Automation health" />
      <HealthList jobs={jobs.filter((j) => j.platform === "pinterest" || j.job === "dashboard_sync")} />
    </div>
  );
}
