import styles from "@/app/admin/admin.module.css";
import s from "@/app/admin/social/social.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { SocialChart } from "@/components/admin/social-chart";
import { TodayChart } from "@/components/admin/social-today-chart";
import { Alerts, CompareTable, GroupTable, HealthList, Kpi, Meter, SectionTitle, SocialTabs, TodayHero } from "@/components/admin/social-ui";
import {
  CHANNEL_COLOR, addDays, buildSeries, compareWindows, countByDay, etDay, fmtWhen, getJobs, getSocialPosts, getTraffic, groupPosts, int, lastNDays, n, nowStamp, pct, todayET, todaySummary,
} from "@/lib/social-dashboard";

export const dynamic = "force-dynamic";
const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const C = CHANNEL_COLOR.tiktok;
const TARGET = 6;

export default async function TikTokDashboard() {
  const [all, jobs, traffic] = await Promise.all([getSocialPosts("tiktok"), getJobs(), getTraffic()]);
  const today = todayET();
  const yesterday = addDays(today, -1);
  const posts = all.filter((p) => p.status === "posted" && p.posted_at);
  const dayOf = (p: (typeof posts)[number]) => etDay(p.posted_at!);
  const postsMap = countByDay(posts, dayOf);
  const viewsMap = countByDay(posts, dayOf, (p) => n(p.views));
  const likesMap = countByDay(posts, dayOf, (p) => n(p.likes));
  const commentsMap = countByDay(posts, dayOf, (p) => n(p.comments));
  const sharesMap = countByDay(posts, dayOf, (p) => n(p.shares));
  const savesMap = countByDay(posts, dayOf, (p) => n(p.saves));

  const totalViews = posts.reduce((a, p) => a + n(p.views), 0);
  const totalLikes = posts.reduce((a, p) => a + n(p.likes), 0);
  const totalComments = posts.reduce((a, p) => a + n(p.comments), 0);
  const withStats = posts.filter((p) => n(p.views) > 0);
  const job = jobs.find((j) => j.job === "tiktok_post");
  const statsJob = jobs.find((j) => j.job === "tiktok_stats");
  const next = ((job?.details?.next_runs as string[] | undefined) ?? []).filter((d) => new Date(d).getTime() > Date.now());
  const hooks = (job?.details?.hook_photos ?? {}) as Record<string, number>;
  const eng = totalViews ? (totalLikes + totalComments) / totalViews : 0;

  const alerts: Array<{ level: "bad" | "warn" | "info"; text: string }> = [];
  const notPublic = posts.filter((p) => str(p.meta.privacy) && str(p.meta.privacy) !== "Everyone");
  if (notPublic.length) alerts.push({ level: "bad", text: `${notPublic.length} post(s) are not public on TikTok (${[...new Set(notPublic.map((p) => str(p.meta.privacy)))].join(", ")}). They can't reach anyone.` });
  for (const [series, c] of Object.entries(hooks)) if (n(c) < 10) alerts.push({ level: "warn", text: `"${series}" has only ${c} hook photos. Hooks will start repeating.` });
  const failed = all.filter((p) => p.status === "failed");
  if (failed.length) alerts.push({ level: "bad", text: `${failed.length} post attempt(s) failed. See the recent posts table.` });
  if (statsJob?.last_success_at && Date.now() - new Date(statsJob.last_success_at).getTime() > 20 * 3600000) alerts.push({ level: "warn", text: "TikTok stats haven't been collected in 20+ hours, so view counts are out of date." });

  const bySeries = groupPosts(posts, (p) => p.series);
  const byHook = groupPosts(posts, (p) => p.hook);
  const bySound = groupPosts(posts, (p) => str(p.meta.sound));
  const byImage = groupPosts(posts, (p) => str(p.meta.hook_image));
  const byPos = groupPosts(posts, (p) => (p.meta.hook_text_y !== undefined && p.meta.hook_text_y !== null ? `text ${Math.round(n(p.meta.hook_text_y) * 100)}% down` : null));
  const byTheme = groupPosts(posts, (p) => str(p.meta.theme));

  const sessions = traffic.sessions.tiktok;
  const outbound = traffic.outbound.tiktok;
  const t = todaySummary(traffic, "tiktok");
  const postedToday = n(postsMap[today]);
  const last7 = compareWindows(postsMap);
  const top = [...withStats].sort((a, b) => n(b.views) - n(a.views)).slice(0, 10);
  const recent = [...all].sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? "")).slice(0, 15);

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/social" />
      <div className={s.head}>
        <div><h1 className={styles.title}>TikTok</h1><p className={styles.subtitle}>Photo carousels: boyfriend and streetwearkid series, 6 posts a day.</p></div>
        <div className={s.stamp}>Eastern time · as of {nowStamp()}</div>
      </div>
      <SocialTabs active="/admin/social/tiktok" />

      <div className={s.todayGrid}>
        <TodayHero
          label="Visits from TikTok today" value={t.visits} prevAtNow={t.prevAtNow} yesterdayTotal={t.yesterday} nowLabel={nowStamp()}
          rows={[["Clicks out to brands", `${t.clicks} (yesterday ${t.clicksYesterday})`], ["Posted today", `${postedToday} of ${TARGET}`], ["Next post", next[0] ? fmtWhen(next[0]) : "none queued"]]}
        />
        <TodayChart title="TikTok visits through the day" lines={[{ key: "tt", label: "TikTok", color: C, today: t.todayCum }]} yesterday={t.yesterdayCum} />
      </div>

      <div className={s.grid} style={{ marginTop: 14 }}>
        <div className={s.kpi}>
          <span>Posted today</span><strong>{postedToday} <small style={{ fontSize: 15, fontWeight: 400 }}>of {TARGET}</small></strong>
          <Meter value={postedToday} max={TARGET} color={C} />
          <small>{n(postsMap[yesterday])} yesterday · {last7.last7} of 42 this week</small>
        </div>
        <Kpi label="Total views" value={int(totalViews)} note={`${withStats.length} of ${posts.length} posts have stats`} spark={lastNDays(viewsMap)} color={C} />
        <Kpi label="Average views per post" value={withStats.length ? int(totalViews / withStats.length) : "-"} />
        <Kpi label="Engagement rate" value={totalViews ? pct(eng) : "-"} note="(likes + comments) ÷ views" spark={lastNDays(likesMap)} color={C} />
      </div>

      <SectionTitle title="Needs attention" hint={alerts.length ? `${alerts.length} item${alerts.length === 1 ? "" : "s"}` : undefined} />
      <Alerts items={alerts} />

      <SectionTitle title="Lined up" hint={`Hook photo runway: ${Object.entries(hooks).map(([k, v]) => `${k} ${v}`).join(" · ") || "unknown"}`} />
      {next.length ? <div className={s.queue}>{next.slice(0, 6).map((d) => <span key={d}>{fmtWhen(d)}</span>)}</div> : <div className={s.empty}>No upcoming posting runs found.</div>}

      <SectionTitle title="Trends" hint="Views, likes and comments count toward the day a post went up" />
      <div className={s.two}>
        <SocialChart title="Posts and views" series={[buildSeries("posts", "Posts", postsMap, "sum", "int", C), buildSeries("views", "Views", viewsMap, "sum", "int", C)]} />
        <SocialChart title="Engagement" series={[buildSeries("likes", "Likes", likesMap, "sum", "int", C), buildSeries("comments", "Comments", commentsMap, "sum", "int", C), buildSeries("shares", "Shares", sharesMap, "sum", "int", C), buildSeries("saves", "Saves", savesMap, "sum", "int", C)]} />
        <SocialChart title="Visits sent to Street" series={[buildSeries("sessions", "Visits", sessions, "sum", "int", C), buildSeries("outbound", "Clicks out", outbound, "sum", "int", C)]} />
      </div>
      <div style={{ marginTop: 14 }}>
        <CompareTable rows={[
          { label: "Posts", c: compareWindows(postsMap) }, { label: "Views", c: compareWindows(viewsMap) }, { label: "Likes", c: compareWindows(likesMap) },
          { label: "Comments", c: compareWindows(commentsMap) }, { label: "Visits to Street", c: compareWindows(sessions) }, { label: "Clicks out", c: compareWindows(outbound) },
        ]} />
      </div>

      <SectionTitle title="What's working" hint="Sorted by average views per post. Wait for 10+ posts before trusting a pattern." />
      <div className={s.two}>
        <GroupTable title="Series / angle" rows={bySeries} />
        <GroupTable title="Hook text" rows={byHook} />
        <GroupTable title="Sound" rows={bySound} />
        <GroupTable title="Hook photo" rows={byImage} />
        <GroupTable title="Text position" rows={byPos} />
        <GroupTable title="Theme" rows={byTheme} />
      </div>

      <SectionTitle title="Top posts" />
      {top.length ? (
        <div className={s.panel}><table className={styles.table}>
          <thead><tr><th>Hook</th><th>Series</th><th>Sound</th><th>Views</th><th>Likes</th><th>Comments</th><th>Eng.</th><th>Posted</th></tr></thead>
          <tbody>{top.map((p) => (
            <tr key={p.external_id}><td><div className={s.thumb}>{p.link ? <a href={p.link} target="_blank" rel="noopener noreferrer">{p.hook}</a> : p.hook}</div></td><td>{p.series}</td><td>{str(p.meta.sound) ?? "-"}</td><td><b>{int(n(p.views))}</b></td><td>{int(n(p.likes))}</td><td>{int(n(p.comments))}</td><td>{pct(n(p.views) ? (n(p.likes) + n(p.comments)) / n(p.views) : 0)}</td><td>{fmtWhen(p.posted_at)}</td></tr>
          ))}</tbody>
        </table></div>
      ) : <div className={s.empty}>No views recorded yet. The stats collector runs at 7:15 AM and 11:15 PM.</div>}

      <SectionTitle title="Recent posts" />
      <div className={s.panel}><table className={styles.table}>
        <thead><tr><th>Posted</th><th>Status</th><th>Series</th><th>Hook</th><th>Sound</th><th>Products</th><th>Views</th><th>Likes</th></tr></thead>
        <tbody>{recent.map((p) => (
          <tr key={p.external_id}><td>{fmtWhen(p.posted_at)}</td><td><span className={styles.pill}>{p.status}</span></td><td>{p.series}</td><td><div className={s.thumb}>{p.hook}</div></td><td>{str(p.meta.sound) ?? "-"}</td><td>{Array.isArray(p.meta.products) ? p.meta.products.length : "-"}</td><td>{p.views ?? "-"}</td><td>{p.likes ?? "-"}</td></tr>
        ))}</tbody>
      </table></div>

      <SectionTitle title="Automation health" />
      <HealthList jobs={jobs.filter((j) => j.platform === "tiktok" || j.job === "dashboard_sync")} />
    </div>
  );
}
