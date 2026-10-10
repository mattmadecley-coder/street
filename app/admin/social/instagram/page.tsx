import styles from "@/app/admin/admin.module.css";
import s from "@/app/admin/social/social.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { SocialChart } from "@/components/admin/social-chart";
import { TodayChart } from "@/components/admin/social-today-chart";
import { Alerts, CompareTable, HealthList, Kpi, Meter, SectionTitle, SocialTabs, TodayHero } from "@/components/admin/social-ui";
import {
  CHANNEL_COLOR, addDays, buildSeries, compareWindows, countByDay, etDay, fmtWhen, getFollowLog, getJobs, getSocialDaily, getSocialPosts, getTraffic, int, lastNDays, n, nowStamp, todayET, todaySummary,
} from "@/lib/social-dashboard";

export const dynamic = "force-dynamic";
const C = CHANNEL_COLOR.instagram;

export default async function InstagramDashboard() {
  const [all, history, daily, follows, jobs, traffic] = await Promise.all([
    getSocialPosts("instagram"), getSocialPosts("instagram", true), getSocialDaily("instagram"), getFollowLog(), getJobs(), getTraffic(),
  ]);
  const today = todayET();
  const yesterday = addDays(today, -1);
  const bot = jobs.find((j) => j.job === "ig_follow_bot");
  const d = (bot?.details ?? {}) as Record<string, number | boolean | undefined>;
  const dayMetric = (metric: string) => { const o: Record<string, number> = {}; for (const r of daily) if (r.metric === metric) o[r.day] = n(r.value); return o; };

  const followsMade = countByDay(follows, (f) => etDay(f.followed_at));
  const checked = follows.filter((f) => f.followed_back !== null);
  const backs = checked.filter((f) => f.followed_back);
  const followBackByDay = countByDay(backs, (f) => etDay(f.followed_at));
  const checkedByDay = countByDay(checked, (f) => etDay(f.followed_at));
  const rateByDay: Record<string, number> = {};
  for (const [day, c] of Object.entries(checkedByDay)) rateByDay[day] = c ? n(followBackByDay[day]) / c : 0;
  const overallRate = checked.length ? backs.length / checked.length : null;

  const followersMap = dayMetric("followers");
  const followingMap = dayMetric("following");
  const latest = (m: Record<string, number>) => { const k = Object.keys(m).sort().pop(); return k ? m[k] : null; };
  const followers = latest(followersMap);
  const following = latest(followingMap);
  const unfollows = dayMetric("unfollows_made");
  const cap = n(d.max_per_day) || 300;

  const pub = all.filter((p) => p.status === "posted" && p.posted_at);
  const lined = all.filter((p) => p.status === "scheduled" && p.scheduled_for && new Date(p.scheduled_for).getTime() > Date.now()).sort((a, b) => a.scheduled_for!.localeCompare(b.scheduled_for!));
  const failed = all.filter((p) => p.status === "failed");
  const postsMap = countByDay(pub, (p) => etDay(p.posted_at!));
  const reach = dayMetric("postiz_reach");
  const sessions = traffic.sessions.instagram;
  const outbound = traffic.outbound.instagram;
  const t = todaySummary(traffic, "instagram");

  const cats = new Map<string, number>();
  for (const p of history.filter((x) => x.kind === "carousel")) cats.set(p.series ?? "other", (cats.get(p.series ?? "other") ?? 0) + 1);

  const alerts: Array<{ level: "bad" | "warn" | "info"; text: string }> = [];
  if (bot) {
    const lf = bot.last_success_at ? Date.now() - new Date(bot.last_success_at).getTime() : Infinity;
    if (d.running === false) alerts.push({ level: "bad", text: "The follow bot isn't running. The watchdog relaunches it every 10 minutes. If this persists, check the PC." });
    else if (lf > 6 * 3600000) alerts.push({ level: "bad", text: `The follow bot is running but hasn't followed anyone in ${Math.round(lf / 3600000)} hours. Its Instagram login may need refreshing.` });
  }
  if (n(d.restarts_7d) >= 3) alerts.push({ level: "warn", text: `The follow bot crashed and was relaunched ${d.restarts_7d} times this week.` });
  if (failed.length) {
    const lf = [...failed].sort((a, b) => (b.scheduled_for ?? "").localeCompare(a.scheduled_for ?? ""))[0];
    alerts.push({ level: "bad", text: `${failed.length} Instagram post(s) failed in Postiz. Latest: ${fmtWhen(lf.scheduled_for)}${lf.meta.error ? ` ("${String(lf.meta.error)}")` : ""}.` });
  }
  if (!lined.length) alerts.push({ level: "warn", text: "Nothing is queued in Postiz for Instagram." });
  if (overallRate !== null && overallRate < 0.03 && checked.length > 100) alerts.push({ level: "warn", text: `Follow-back rate is only ${(overallRate * 100).toFixed(1)}%. Consider switching the target accounts.` });

  const posted7 = compareWindows(postsMap);
  const followedToday = n(followsMade[today]);
  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/social" />
      <div className={s.head}>
        <div><h1 className={styles.title}>Instagram</h1><p className={styles.subtitle}>@streetdotcomstreetwear: daily carousels and reels via Postiz, plus the follow-for-follow bot.</p></div>
        <div className={s.stamp}>Eastern time · as of {nowStamp()}</div>
      </div>
      <SocialTabs active="/admin/social/instagram" />

      <div className={s.todayGrid}>
        <TodayHero
          label="Visits from Instagram today" value={t.visits} prevAtNow={t.prevAtNow} yesterdayTotal={t.yesterday} nowLabel={nowStamp()}
          rows={[["Clicks out to brands", `${t.clicks} (yesterday ${t.clicksYesterday})`], ["Followed today", `${followedToday} of ${cap}`], ["Posted today", String(n(postsMap[today]))]]}
        />
        <TodayChart title="Instagram visits through the day" lines={[{ key: "ig", label: "Instagram", color: C, today: t.todayCum }]} yesterday={t.yesterdayCum} />
      </div>

      <SectionTitle title="Follow-for-follow" hint={`${d.max_per_hour ?? "?"} follows/hour · ${cap}/day · ${d.max_likes_per_day ?? "?"} likes/day`} />
      <div className={s.grid}>
        <div className={s.kpi}>
          <span>Followed today</span><strong>{followedToday} <small style={{ fontSize: 15, fontWeight: 400 }}>of {cap}</small></strong>
          <Meter value={followedToday} max={cap} color={C} />
          <small>{n(followsMade[yesterday])} yesterday</small>
        </div>
        <Kpi label="Followed in the last 7 days" value={int(compareWindows(followsMade).last7)} cur={compareWindows(followsMade).last7} prev={compareWindows(followsMade).prev7} vs="the 7 before" spark={lastNDays(followsMade)} color={C} />
        <Kpi label="Followers" value={followers === null ? "-" : int(followers)} note={following === null ? "not read yet" : `following ${int(following)}`} />
        <Kpi label="People followed in total" value={int(follows.length)} note={`${d.target_accounts ?? "?"} target accounts`} />
        <Kpi label="Follow-back rate" value={overallRate === null ? "n/a" : `${(overallRate * 100).toFixed(1)}%`} note={overallRate === null ? "Instagram doesn't expose the follower list without a deeper login" : `${backs.length} of ${checked.length} checked`} />
        <Kpi label="Unfollowed" value={int(Object.values(unfollows).reduce((a, v) => a + v, 0))} note={d.unfollow_enabled ? `auto-unfollow after ${d.unfollow_after_days} days` : "auto-unfollow is off"} />
      </div>
      <div className={s.two} style={{ marginTop: 14 }}>
        <SocialChart title="People followed" series={[buildSeries("f", "Follows", followsMade, "sum", "int", C), buildSeries("u", "Unfollows", unfollows, "sum", "int", C)]} />
        {checked.length ? <SocialChart title="Follow-backs" subtitle="by the day we followed them" series={[buildSeries("b", "Follow-backs", followBackByDay, "sum", "int", C), buildSeries("r", "Follow-back rate", rateByDay, "last", "pct", C)]} /> : <SocialChart title="Followers" series={[buildSeries("fl", "Followers", followersMap, "last", "int", C), buildSeries("fg", "Following", followingMap, "last", "int", C)]} />}
      </div>

      <SectionTitle title="Needs attention" hint={alerts.length ? `${alerts.length} item${alerts.length === 1 ? "" : "s"}` : undefined} />
      <Alerts items={alerts} />

      <SectionTitle title="Bot health" />
      <HealthList jobs={jobs.filter((j) => j.platform === "instagram" || j.job === "dashboard_sync")} />
      {bot ? <p className={s.note} style={{ marginTop: 10 }}>Process running: {d.running ? "yes" : "NO"} · restarts in 7 days: {n(d.restarts_7d)} · scheduled daily at hour {d.run_at_hour ?? "?"} · last follow {fmtWhen(bot.last_success_at)}</p> : null}

      <SectionTitle title="Posting" />
      <div className={s.grid}>
        <Kpi label="Posted today" value={String(n(postsMap[today]))} cur={n(postsMap[today])} prev={n(postsMap[yesterday])} />
        <Kpi label="Posts in the last 7 days" value={String(posted7.last7)} cur={posted7.last7} prev={posted7.prev7} vs="the 7 before" spark={lastNDays(postsMap)} color={C} />
        <Kpi label="Lined up in Postiz" value={String(lined.length)} note={lined[0] ? `next: ${fmtWhen(lined[0].scheduled_for)}` : "queue is empty"} />
        <Kpi label="Reach, last 7 days" value={int(compareWindows(reach).last7)} cur={compareWindows(reach).last7} prev={compareWindows(reach).prev7} vs="the 7 before" spark={lastNDays(reach)} color={C} />
      </div>
      <div className={s.two} style={{ marginTop: 14 }}>
        <SocialChart title="Posts and reach" series={[buildSeries("p", "Posts", postsMap, "sum", "int", C), buildSeries("r", "Reach", reach, "sum", "int", C)]} />
        <SocialChart title="Visits sent to Street" series={[buildSeries("s", "Visits", sessions, "sum", "int", C), buildSeries("o", "Clicks out", outbound, "sum", "int", C)]} />
      </div>
      <div style={{ marginTop: 14 }}>
        <CompareTable rows={[
          { label: "People followed", c: compareWindows(followsMade) }, { label: "Posts", c: compareWindows(postsMap) }, { label: "Reach", c: compareWindows(reach) },
          { label: "Visits to Street", c: compareWindows(sessions) }, { label: "Clicks out", c: compareWindows(outbound) },
        ]} />
      </div>

      <SectionTitle title="Lined up in Postiz" />
      {lined.length ? (
        <div className={s.panel}><table className={styles.table}>
          <thead><tr><th>When</th><th>Caption</th></tr></thead>
          <tbody>{lined.slice(0, 20).map((p) => <tr key={p.external_id}><td>{fmtWhen(p.scheduled_for)}</td><td><div className={s.thumb}>{p.title}</div></td></tr>)}</tbody>
        </table></div>
      ) : <div className={s.empty}>The queue is empty.</div>}

      <SectionTitle title="Recent posts" />
      <div className={s.panel}><table className={styles.table}>
        <thead><tr><th>Posted</th><th>Status</th><th>Caption</th><th>Link</th></tr></thead>
        <tbody>{[...pub, ...failed].sort((a, b) => (b.posted_at ?? b.scheduled_for ?? "").localeCompare(a.posted_at ?? a.scheduled_for ?? "")).slice(0, 15).map((p) => (
          <tr key={p.external_id}><td>{fmtWhen(p.posted_at ?? p.scheduled_for)}</td><td><span className={styles.pill}>{p.status}</span></td><td><div className={s.thumb}>{p.title}</div></td><td>{p.link ? <a href={p.link} target="_blank" rel="noopener noreferrer">open</a> : "-"}</td></tr>
        ))}</tbody>
      </table></div>

      {cats.size ? (
        <>
          <SectionTitle title="Carousels by category" />
          <div className={s.queue}>{[...cats.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k}>{k}: {v}</span>)}</div>
        </>
      ) : null}
    </div>
  );
}
