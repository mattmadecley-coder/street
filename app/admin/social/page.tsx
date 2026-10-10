import styles from "@/app/admin/admin.module.css";
import s from "@/app/admin/social/social.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { SocialChart } from "@/components/admin/social-chart";
import { Alerts, CompareTable, HealthList, Kpi, SocialTabs } from "@/components/admin/social-ui";
import {
  PLATFORMS, buildSeries, compareWindows, countByDay, etDay, fmtWhen, getJobs, getSocialPosts, getTraffic, int, jobHealth, n, todayET, addDays,
  type Platform,
} from "@/lib/social-dashboard";

export const dynamic = "force-dynamic";
const LABEL: Record<Platform, string> = { tiktok: "TikTok", instagram: "Instagram", pinterest: "Pinterest" };

export default async function SocialOverviewPage() {
  const [posts, jobs, traffic] = await Promise.all([getSocialPosts(), getJobs(), getTraffic()]);
  const today = todayET();
  const yesterday = addDays(today, -1);
  const now = Date.now();

  const by = (p: Platform) => posts.filter((x) => x.platform === p);
  const posted = (p: Platform) => by(p).filter((x) => x.status === "posted" && x.posted_at);
  const lined = (p: Platform) => by(p).filter((x) => x.status === "scheduled" && x.scheduled_for && new Date(x.scheduled_for).getTime() > now);
  const tiktokJob = jobs.find((j) => j.job === "tiktok_post");
  const tiktokNext = ((tiktokJob?.details?.next_runs as string[] | undefined) ?? []).filter((d) => new Date(d).getTime() > now && new Date(d).getTime() < now + 36 * 3600000);
  const queued: Record<Platform, number> = { tiktok: tiktokNext.length, instagram: lined("instagram").length, pinterest: lined("pinterest").length };

  const alerts: Array<{ level: "bad" | "warn" | "info"; text: string }> = [];
  for (const j of jobs) {
    const h = jobHealth(j);
    if (h.level === "bad") alerts.push({ level: "bad", text: `${j.job.replace(/_/g, " ")}: ${h.label}${j.last_message ? ` - ${j.last_message}` : ""}` });
    else if (h.level === "warn") alerts.push({ level: "warn", text: `${j.job.replace(/_/g, " ")}: ${h.label}${j.last_message ? ` - ${j.last_message}` : ""}` });
  }
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(new Date()));
  const ttToday = posted("tiktok").filter((x) => etDay(x.posted_at!) === today).length;
  if (hour >= 11 && ttToday === 0 && tiktokJob) alerts.push({ level: "bad", text: "TikTok: nothing has been posted yet today." });
  const hooks = (tiktokJob?.details?.hook_photos ?? {}) as Record<string, number>;
  for (const [series, count] of Object.entries(hooks)) if (n(count) < 10) alerts.push({ level: "warn", text: `TikTok "${series}" is down to ${count} hook photos - add more so hooks don't repeat.` });
  if (jobs.length && queued.pinterest === 0) alerts.push({ level: "warn", text: "Pinterest: no pins are lined up (the 5 AM run schedules the next batch)." });
  const igFailed = by("instagram").filter((x) => x.status === "failed" && x.scheduled_for && now - new Date(x.scheduled_for).getTime() < 7 * 86400000);
  if (igFailed.length) alerts.push({ level: "bad", text: `Instagram: ${igFailed.length} post(s) failed in the last 7 days (Postiz: "${String(igFailed[0].meta.error ?? "unknown error")}").` });
  if (jobs.length && queued.instagram === 0) alerts.push({ level: "warn", text: "Instagram: nothing is queued in Postiz." });

  const sum = (rec: Record<string, number>[]) => { const o: Record<string, number> = {}; for (const r of rec) for (const [d, v] of Object.entries(r)) o[d] = (o[d] ?? 0) + v; return o; };
  const sessionsAll = sum(PLATFORMS.map((p) => traffic.sessions[p]));
  const outboundAll = sum(PLATFORMS.map((p) => traffic.outbound[p]));
  const trafficSeries = [
    buildSeries("all", "All social", sessionsAll), ...PLATFORMS.map((p) => buildSeries(p, LABEL[p], traffic.sessions[p])),
  ];
  const postsAll = sum(PLATFORMS.map((p) => countByDay(posted(p), (x) => etDay(x.posted_at!))));
  const postSeries = [buildSeries("all", "All", postsAll), ...PLATFORMS.map((p) => buildSeries(p, LABEL[p], countByDay(posted(p), (x) => etDay(x.posted_at!))))];

  const top = posts.filter((x) => n(x.views) > 0).sort((a, b) => n(b.views) - n(a.views)).slice(0, 8);

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/social" />
      <div className={s.head}>
        <div><h1 className={styles.title}>Social growth</h1><p className={styles.subtitle}>Everything the TikTok, Instagram and Pinterest automations are doing, and what it sends to Street.</p></div>
      </div>
      <SocialTabs active="/admin/social" />

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Needs attention</h2></div>
        <Alerts items={alerts} />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Channels at a glance</h2><p className={styles.rowMeta}>Eastern time · today vs yesterday</p></div>
        <div className={s.two}>
          {PLATFORMS.map((p) => {
            const postedMap = countByDay(posted(p), (x) => etDay(x.posted_at!));
            const sess = traffic.sessions[p];
            const out = traffic.outbound[p];
            const c = compareWindows(sess);
            const outC = compareWindows(out);
            const next = p === "tiktok" ? tiktokNext[0] : lined(p).map((x) => x.scheduled_for!).sort()[0];
            return (
              <div key={p}>
                <h3 style={{ fontSize: 15, margin: "0 0 8px" }}><a href={`/admin/social/${p}`} style={{ color: "inherit" }}>{LABEL[p]} &rarr;</a></h3>
                <div className={s.grid}>
                  <Kpi label="Posted today" value={String(n(postedMap[today]))} cur={n(postedMap[today])} prev={n(postedMap[yesterday])} />
                  <Kpi label="Lined up" value={String(queued[p])} note={next ? `next: ${fmtWhen(next)}` : "nothing queued"} />
                  <Kpi label="Visits (7d)" value={int(c.last7)} cur={c.last7} prev={c.prev7} vs="prior 7d" />
                  <Kpi label="Outbound clicks (7d)" value={int(outC.last7)} cur={outC.last7} prev={outC.prev7} vs="prior 7d" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Traffic sent to Street</h2><p className={styles.rowMeta}>Sessions that arrived from each channel, measured by Street&apos;s own analytics</p></div>
        <SocialChart title="Social sessions" subtitle="Pinterest + Instagram tagged links, TikTok/other by referrer" series={trafficSeries} />
        <div style={{ marginTop: 18 }}>
          <CompareTable rows={[
            { label: "Social sessions", c: compareWindows(sessionsAll) },
            { label: "Outbound clicks to brands", c: compareWindows(outboundAll) },
            { label: "Posts published", c: compareWindows(postsAll) },
          ]} />
        </div>
        {!Object.values(sessionsAll).some((v) => v > 0) ? <p className={s.note} style={{ marginTop: 10 }}>No social traffic recorded yet. Pinterest pins carry utm_source=pinterest; TikTok shows up when the in-app browser sends a referrer. Numbers will appear as soon as the first visits land.</p> : null}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Output</h2><p className={styles.rowMeta}>Posts published per period (all channels)</p></div>
        <SocialChart title="Posts published" series={postSeries} />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Are the bots working?</h2></div>
        <HealthList jobs={jobs} />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Best content so far</h2></div>
        {top.length ? (
          <table className={styles.table}>
            <thead><tr><th>Channel</th><th>Post</th><th>Series</th><th>Views</th><th>Likes</th><th>Comments</th><th>Posted</th></tr></thead>
            <tbody>{top.map((x) => (
              <tr key={x.platform + x.external_id}><td>{LABEL[x.platform]}</td><td><div className={s.thumb}>{x.link ? <a href={x.link} target="_blank" rel="noopener noreferrer">{x.hook || x.title}</a> : x.hook || x.title}</div></td><td>{x.series ?? "-"}</td><td>{int(n(x.views))}</td><td>{int(n(x.likes))}</td><td>{int(n(x.comments))}</td><td>{fmtWhen(x.posted_at)}</td></tr>
            ))}</tbody>
          </table>
        ) : <div className={s.empty}>No post has view data yet. TikTok stats are pulled at 7:15 AM and 11:15 PM; the first numbers appear after the first full day.</div>}
      </div>
    </div>
  );
}
