import styles from "@/app/admin/admin.module.css";
import s from "@/app/admin/social/social.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { SocialChart } from "@/components/admin/social-chart";
import { Alerts, CompareTable, GroupTable, HealthList, Kpi, SocialTabs } from "@/components/admin/social-ui";
import {
  addDays, buildSeries, compareWindows, countByDay, etDay, fmtWhen, getJobs, getSocialPosts, getTraffic, groupPosts, int, n, pct, todayET,
} from "@/lib/social-dashboard";

export const dynamic = "force-dynamic";
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

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

  const alerts: Array<{ level: "bad" | "warn" | "info"; text: string }> = [];
  const notPublic = posts.filter((p) => str(p.meta.privacy) && str(p.meta.privacy) !== "Everyone");
  if (notPublic.length) alerts.push({ level: "bad", text: `${notPublic.length} post(s) are not public on TikTok (privacy: ${[...new Set(notPublic.map((p) => str(p.meta.privacy)))].join(", ")}). They can't reach anyone.` });
  for (const [series, c] of Object.entries(hooks)) if (n(c) < 10) alerts.push({ level: "warn", text: `"${series}" has only ${c} hook photos - hooks will start repeating.` });
  const failed = all.filter((p) => p.status === "failed");
  if (failed.length) alerts.push({ level: "bad", text: `${failed.length} post attempt(s) failed - see the log in the recent posts table.` });
  const stale = statsJob && statsJob.last_success_at ? Date.now() - new Date(statsJob.last_success_at).getTime() > 20 * 3600000 : false;
  if (stale) alerts.push({ level: "warn", text: "TikTok stats haven't been collected in 20+ hours, so view counts below are out of date." });

  const hookOf = (p: (typeof posts)[number]) => p.hook;
  const bySeries = groupPosts(posts, (p) => p.series);
  const byHook = groupPosts(posts, hookOf);
  const bySound = groupPosts(posts, (p) => str(p.meta.sound));
  const byImage = groupPosts(posts, (p) => str(p.meta.hook_image));
  const byPos = groupPosts(posts, (p) => (p.meta.hook_text_y !== undefined && p.meta.hook_text_y !== null ? `text at ${Math.round(n(p.meta.hook_text_y) * 100)}% down` : null));
  const byTheme = groupPosts(posts, (p) => str(p.meta.theme));

  const ctr = (m: Record<string, number>) => m;
  const sessions = traffic.sessions.tiktok;
  const outbound = traffic.outbound.tiktok;
  const eng = totalViews ? (totalLikes + totalComments) / totalViews : 0;
  const last7 = compareWindows(postsMap);

  const top = [...withStats].sort((a, b) => n(b.views) - n(a.views)).slice(0, 10);
  const recent = [...all].sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? "")).slice(0, 15);

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/social" />
      <h1 className={styles.title}>TikTok growth</h1>
      <p className={styles.subtitle}>Photo-carousel program: boyfriend and streetwearkid series, 6 posts a day.</p>
      <SocialTabs active="/admin/social/tiktok" />

      <Alerts items={alerts} />

      <div className={s.grid}>
        <Kpi label="Posted today" value={String(n(postsMap[today]))} cur={n(postsMap[today])} prev={n(postsMap[yesterday])} note="target 6 a day" />
        <Kpi label="Posts (7d)" value={String(last7.last7)} cur={last7.last7} prev={last7.prev7} vs="prior 7d" note="target 42" />
        <Kpi label="Total views" value={int(totalViews)} note={`${withStats.length} posts with stats`} />
        <Kpi label="Avg views / post" value={withStats.length ? int(totalViews / withStats.length) : "-"} />
        <Kpi label="Engagement rate" value={totalViews ? pct(eng) : "-"} note="(likes + comments) / views" />
        <Kpi label="Visits from TikTok (7d)" value={int(compareWindows(sessions).last7)} cur={compareWindows(sessions).last7} prev={compareWindows(sessions).prev7} vs="prior 7d" />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Lined up</h2></div>
        {next.length ? <div className={s.queue}>{next.slice(0, 6).map((d) => <span key={d}>{fmtWhen(d)}</span>)}</div> : <div className={s.empty}>No upcoming posting runs found.</div>}
        <p className={s.note} style={{ marginTop: 10 }}>
          Hook photo runway: {Object.keys(hooks).length ? Object.entries(hooks).map(([k, v]) => `${k} ${v} photos`).join(" · ") : "unknown"}. Each run builds a fresh carousel (hook photo + 7-8 product screens + a sound from your Favorites) and posts it.
        </p>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Trends</h2><p className={styles.rowMeta}>Views, likes and comments are credited to the day the post went up</p></div>
        <div className={s.two}>
          <SocialChart title="Posts published" series={[buildSeries("posts", "Posts", postsMap)]} />
          <SocialChart title="Views" series={[buildSeries("views", "Views", viewsMap)]} />
          <SocialChart title="Engagement" series={[buildSeries("likes", "Likes", likesMap), buildSeries("comments", "Comments", commentsMap), buildSeries("shares", "Shares", sharesMap), buildSeries("saves", "Saves", savesMap)]} />
          <SocialChart title="Visits sent to Street" series={[buildSeries("sessions", "Sessions", sessions), buildSeries("outbound", "Outbound clicks", outbound)]} />
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Today, this week, this month</h2></div>
        <CompareTable rows={[
          { label: "Posts", c: compareWindows(postsMap) }, { label: "Views", c: compareWindows(viewsMap) }, { label: "Likes", c: compareWindows(likesMap) },
          { label: "Comments", c: compareWindows(commentsMap) }, { label: "Visits to Street", c: compareWindows(ctr(sessions)) }, { label: "Outbound clicks", c: compareWindows(outbound) },
        ]} />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>What&apos;s working</h2><p className={styles.rowMeta}>Sorted by average views per post. Small samples are noisy - look for patterns after 10+ posts.</p></div>
        <div className={s.two}>
          <GroupTable title="By series / angle" rows={bySeries} />
          <GroupTable title="By hook text" rows={byHook} />
          <GroupTable title="By sound" rows={bySound} />
          <GroupTable title="By hook photo" rows={byImage} />
          <GroupTable title="By text position" rows={byPos} />
          <GroupTable title="By theme" rows={byTheme} />
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Top posts</h2></div>
        {top.length ? (
          <table className={styles.table}>
            <thead><tr><th>Hook</th><th>Series</th><th>Sound</th><th>Views</th><th>Likes</th><th>Comments</th><th>Eng.</th><th>Posted</th></tr></thead>
            <tbody>{top.map((p) => (
              <tr key={p.external_id}><td><div className={s.thumb}>{p.link ? <a href={p.link} target="_blank" rel="noopener noreferrer">{p.hook}</a> : p.hook}</div></td><td>{p.series}</td><td>{str(p.meta.sound) ?? "-"}</td><td>{int(n(p.views))}</td><td>{int(n(p.likes))}</td><td>{int(n(p.comments))}</td><td>{pct(n(p.views) ? (n(p.likes) + n(p.comments)) / n(p.views) : 0)}</td><td>{fmtWhen(p.posted_at)}</td></tr>
            ))}</tbody>
          </table>
        ) : <div className={s.empty}>No views recorded yet. The stats collector runs at 7:15 AM and 11:15 PM.</div>}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Recent posts</h2></div>
        <table className={styles.table}>
          <thead><tr><th>Posted</th><th>Status</th><th>Series</th><th>Hook</th><th>Sound</th><th>Products</th><th>Views</th><th>Likes</th></tr></thead>
          <tbody>{recent.map((p) => (
            <tr key={p.external_id}><td>{fmtWhen(p.posted_at)}</td><td><span className={styles.pill}>{p.status}</span></td><td>{p.series}</td><td><div className={s.thumb}>{p.hook}</div></td><td>{str(p.meta.sound) ?? "-"}</td><td>{Array.isArray(p.meta.products) ? p.meta.products.length : "-"}</td><td>{p.views ?? "-"}</td><td>{p.likes ?? "-"}</td></tr>
          ))}</tbody>
        </table>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Automation health</h2></div>
        <HealthList jobs={jobs.filter((j) => j.platform === "tiktok" || j.job === "dashboard_sync")} />
      </div>
    </div>
  );
}
