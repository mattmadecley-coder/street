import styles from "@/app/admin/admin.module.css";
import s from "@/app/admin/social/social.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { SocialChart } from "@/components/admin/social-chart";
import { Alerts, CompareTable, HealthList, Kpi, SocialTabs } from "@/components/admin/social-ui";
import {
  addDays, buildSeries, compareWindows, countByDay, etDay, fmtWhen, getFollowLog, getJobs, getSocialDaily, getSocialPosts, getTraffic, int, n, pct, todayET,
} from "@/lib/social-dashboard";

export const dynamic = "force-dynamic";

export default async function InstagramDashboard() {
  const [all, history, daily, follows, jobs, traffic] = await Promise.all([
    getSocialPosts("instagram"), getSocialPosts("instagram", true), getSocialDaily("instagram"), getFollowLog(), getJobs(), getTraffic(),
  ]);
  const today = todayET();
  const yesterday = addDays(today, -1);
  const bot = jobs.find((j) => j.job === "ig_follow_bot");
  const d = (bot?.details ?? {}) as Record<string, number | boolean | undefined>;
  const dayMetric = (metric: string) => { const o: Record<string, number> = {}; for (const r of daily) if (r.metric === metric) o[r.day] = n(r.value); return o; };

  // follow activity: recompute from the log so it's exact even if the daily rollup lags
  const followsMade = countByDay(follows, (f) => etDay(f.followed_at));
  const checked = follows.filter((f) => f.followed_back !== null);
  const backs = checked.filter((f) => f.followed_back);
  const followBackByDay = countByDay(backs, (f) => etDay(f.followed_at));
  const checkedByDay = countByDay(checked, (f) => etDay(f.followed_at));
  const rateByDay: Record<string, number> = {};
  for (const [day, c] of Object.entries(checkedByDay)) rateByDay[day] = c ? n(followBackByDay[day]) / c : 0;
  const mature = checked.filter((f) => Date.now() - new Date(f.followed_at).getTime() > 3 * 86400000);
  const matureRate = mature.length ? mature.filter((f) => f.followed_back).length / mature.length : null;
  const overallRate = checked.length ? backs.length / checked.length : null;

  const followersMap = dayMetric("followers");
  const followingMap = dayMetric("following");
  const latest = (m: Record<string, number>) => { const k = Object.keys(m).sort().pop(); return k ? m[k] : null; };
  const followers = latest(followersMap);
  const unfollows = dayMetric("unfollows_made");

  const pub = all.filter((p) => p.status === "posted" && p.posted_at);
  const lined = all.filter((p) => p.status === "scheduled" && p.scheduled_for && new Date(p.scheduled_for).getTime() > Date.now()).sort((a, b) => a.scheduled_for!.localeCompare(b.scheduled_for!));
  const failed = all.filter((p) => p.status === "failed");
  const postsMap = countByDay(pub, (p) => etDay(p.posted_at!));
  const reach = dayMetric("postiz_reach");
  const sessions = traffic.sessions.instagram;
  const outbound = traffic.outbound.instagram;

  const cats = new Map<string, number>();
  for (const p of history.filter((x) => x.kind === "carousel")) cats.set(p.series ?? "other", (cats.get(p.series ?? "other") ?? 0) + 1);

  const alerts: Array<{ level: "bad" | "warn" | "info"; text: string }> = [];
  if (bot && d.running === false) alerts.push({ level: "bad", text: "The follow bot isn't running. The watchdog relaunches it every 10 minutes - if this persists, check the PC." });
  if (n(d.restarts_7d) >= 3) alerts.push({ level: "warn", text: `The follow bot crashed and was relaunched ${d.restarts_7d} times this week.` });
  if (failed.length) { const lf = [...failed].sort((a, b) => (b.scheduled_for ?? "").localeCompare(a.scheduled_for ?? ""))[0]; alerts.push({ level: "bad", text: `${failed.length} Instagram post(s) failed in Postiz. Latest: ${fmtWhen(lf.scheduled_for)}${lf.meta.error ? ` - "${String(lf.meta.error)}"` : ""}` }); }
  if (!lined.length) alerts.push({ level: "warn", text: "Nothing is queued in Postiz for Instagram." });
  if (overallRate !== null && overallRate < 0.03 && checked.length > 100) alerts.push({ level: "warn", text: `Follow-back rate is only ${pct(overallRate)} - consider switching the target accounts.` });

  const posted7 = compareWindows(postsMap);
  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/social" />
      <h1 className={styles.title}>Instagram growth</h1>
      <p className={styles.subtitle}>@streetdotcomstreetwear - daily carousels and reels via Postiz, plus the follow-for-follow bot.</p>
      <SocialTabs active="/admin/social/instagram" />
      <Alerts items={alerts} />

      <div className={styles.sectionHead}><h2>Follow-for-follow</h2></div>
      <div className={s.grid}>
        <Kpi label="Followed today" value={`${n(followsMade[today])} / ${d.max_per_day ?? 300}`} cur={n(followsMade[today])} prev={n(followsMade[yesterday])} />
        <Kpi label="Followed (7d)" value={int(compareWindows(followsMade).last7)} cur={compareWindows(followsMade).last7} prev={compareWindows(followsMade).prev7} vs="prior 7d" />
        <Kpi label="Total followed" value={int(follows.length)} note={`${d.target_accounts ?? "?"} target accounts`} />
        <Kpi label="Follow-back rate" value={overallRate === null ? "n/a" : pct(overallRate)} note={overallRate === null ? "not being measured yet" : `${backs.length} of ${checked.length} checked${matureRate !== null ? ` · ${pct(matureRate)} after 3+ days` : ""}`} />
        <Kpi label="Followers" value={followers === null ? "n/a" : int(followers)} note={followers === null ? "not read yet" : `following ${int(n(latest(followingMap)))}`} />
        <Kpi label="Unfollowed" value={int(Object.values(unfollows).reduce((a, v) => a + v, 0))} note={d.unfollow_enabled ? `auto-unfollow after ${d.unfollow_after_days} days` : "auto-unfollow off"} />
      </div>
      <div className={s.two} style={{ marginTop: 14 }}>
        <SocialChart title="People followed" series={[buildSeries("f", "Follows", followsMade), buildSeries("u", "Unfollows", unfollows)]} />
        <SocialChart title="Follow-backs" subtitle="by the day we followed them" series={[buildSeries("b", "Follow-backs", followBackByDay), buildSeries("r", "Follow-back rate", rateByDay, "last", "pct")]} />
        {followers !== null ? <SocialChart title="Followers" series={[buildSeries("fl", "Followers", followersMap, "last")]} line /> : null}
      </div>
      <p className={s.note} style={{ marginTop: 10 }}>
        Limits: {d.max_per_hour ?? "?"} follows/hour, {d.max_per_day ?? "?"}/day, {d.max_likes_per_day ?? "?"} likes/day. Followers and following are read from the public profile every few hours. Follow-back rate stays n/a because Instagram does not show the follower list without a deeper login.
      </p>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Bot health</h2></div>
        <HealthList jobs={jobs.filter((j) => j.platform === "instagram" || j.job === "dashboard_sync")} />
        {bot ? <p className={s.note} style={{ marginTop: 10 }}>Process running: {d.running ? "yes" : "NO"} · restarts in 7 days: {n(d.restarts_7d)} · runs daily at hour {d.run_at_hour ?? "?"} · last follow {fmtWhen(bot.last_success_at)}</p> : null}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Posting</h2></div>
        <div className={s.grid}>
          <Kpi label="Posted today" value={String(n(postsMap[today]))} cur={n(postsMap[today])} prev={n(postsMap[yesterday])} />
          <Kpi label="Posts (7d)" value={String(posted7.last7)} cur={posted7.last7} prev={posted7.prev7} vs="prior 7d" />
          <Kpi label="Lined up" value={String(lined.length)} note={lined[0] ? `next: ${fmtWhen(lined[0].scheduled_for)}` : "queue empty"} />
          <Kpi label="Reach (7d)" value={int(compareWindows(reach).last7)} cur={compareWindows(reach).last7} prev={compareWindows(reach).prev7} vs="prior 7d" />
          <Kpi label="Visits from Instagram (7d)" value={int(compareWindows(sessions).last7)} cur={compareWindows(sessions).last7} prev={compareWindows(sessions).prev7} vs="prior 7d" />
        </div>
        <div className={s.two} style={{ marginTop: 14 }}>
          <SocialChart title="Posts published" series={[buildSeries("p", "Posts", postsMap)]} />
          <SocialChart title="Reach" subtitle="from Postiz / Instagram insights" series={[buildSeries("r", "Reach", reach)]} />
          <SocialChart title="Visits sent to Street" series={[buildSeries("s", "Sessions", sessions), buildSeries("o", "Outbound clicks", outbound)]} />
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Today, this week, this month</h2></div>
        <CompareTable rows={[
          { label: "People followed", c: compareWindows(followsMade) }, { label: "Follow-backs (by follow date)", c: compareWindows(followBackByDay) },
          { label: "Posts", c: compareWindows(postsMap) }, { label: "Reach", c: compareWindows(reach) },
          { label: "Visits to Street", c: compareWindows(sessions) }, { label: "Outbound clicks", c: compareWindows(outbound) },
        ]} />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Lined up in Postiz</h2></div>
        {lined.length ? (
          <table className={styles.table}>
            <thead><tr><th>When</th><th>Caption</th></tr></thead>
            <tbody>{lined.slice(0, 20).map((p) => <tr key={p.external_id}><td>{fmtWhen(p.scheduled_for)}</td><td><div className={s.thumb}>{p.title}</div></td></tr>)}</tbody>
          </table>
        ) : <div className={s.empty}>Queue is empty.</div>}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Recent posts</h2></div>
        <table className={styles.table}>
          <thead><tr><th>Posted</th><th>Status</th><th>Caption</th><th>Link</th></tr></thead>
          <tbody>{[...pub, ...failed].sort((a, b) => (b.posted_at ?? b.scheduled_for ?? "").localeCompare(a.posted_at ?? a.scheduled_for ?? "")).slice(0, 15).map((p) => (
            <tr key={p.external_id}><td>{fmtWhen(p.posted_at ?? p.scheduled_for)}</td><td><span className={styles.pill}>{p.status}</span></td><td><div className={s.thumb}>{p.title}</div></td><td>{p.link ? <a href={p.link} target="_blank" rel="noopener noreferrer">open</a> : "-"}</td></tr>
          ))}</tbody>
        </table>
      </div>

      {cats.size ? (
        <div className={styles.section}>
          <div className={styles.sectionHead}><h2>Carousels by category</h2></div>
          <div className={s.queue}>{[...cats.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k}>{k}: {v}</span>)}</div>
        </div>
      ) : null}
    </div>
  );
}
