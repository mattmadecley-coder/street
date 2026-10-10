import styles from "@/app/admin/admin.module.css";
import s from "@/app/admin/social/social.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { SocialChart } from "@/components/admin/social-chart";
import { TodayChart } from "@/components/admin/social-today-chart";
import { Alerts, ChannelCard, CompareTable, HealthList, SectionTitle, SocialTabs, TodayHero } from "@/components/admin/social-ui";
import {
  CHANNEL_COLOR, CHANNEL_LABEL, PLATFORMS, addDays, buildSeries, compareWindows, countByDay, etDay, fmtWhen, getJobs, getSocialPosts, getTraffic, int, jobHealth, lastNDays,
  n, nowStamp, todayET, todaySummary, type Platform,
} from "@/lib/social-dashboard";

export const dynamic = "force-dynamic";
const TARGET: Partial<Record<Platform, number>> = { tiktok: 6, pinterest: 10 };

export default async function SocialOverviewPage() {
  const [posts, jobs, traffic] = await Promise.all([getSocialPosts(), getJobs(), getTraffic()]);
  const today = todayET();
  const yesterday = addDays(today, -1);
  const now = Date.now();
  const stamp = nowStamp();

  const by = (p: Platform) => posts.filter((x) => x.platform === p);
  const whenOf = (x: (typeof posts)[number]) => (x.platform === "pinterest" ? x.scheduled_for ?? x.posted_at : x.posted_at);
  const posted = (p: Platform) => by(p).filter((x) => (x.status === "posted" || (p === "pinterest" && x.status === "scheduled")) && whenOf(x));
  const postedMap = (p: Platform) => countByDay(posted(p), (x) => etDay(whenOf(x)!));
  const lined = (p: Platform) => by(p).filter((x) => x.status === "scheduled" && x.scheduled_for && new Date(x.scheduled_for).getTime() > now);
  const tiktokJob = jobs.find((j) => j.job === "tiktok_post");
  const tiktokNext = ((tiktokJob?.details?.next_runs as string[] | undefined) ?? []).filter((d) => new Date(d).getTime() > now && new Date(d).getTime() < now + 36 * 3600000);
  const queued: Record<Platform, number> = { tiktok: tiktokNext.length, instagram: lined("instagram").length, pinterest: lined("pinterest").length };
  const nextUp = (p: Platform) => (p === "tiktok" ? tiktokNext[0] : lined(p).map((x) => x.scheduled_for!).sort()[0]);

  // ---- attention
  const alerts: Array<{ level: "bad" | "warn" | "info"; text: string }> = [];
  for (const j of jobs) {
    const h = jobHealth(j);
    if (h.level === "bad" || h.level === "warn") alerts.push({ level: h.level === "bad" ? "bad" : "warn", text: `${j.job.replace(/_/g, " ")}: ${h.label}${j.last_message ? `. ${j.last_message}` : ""}` });
  }
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(new Date())) % 24;
  const ttToday = n(postedMap("tiktok")[today]);
  if (hour >= 11 && ttToday === 0 && tiktokJob) alerts.push({ level: "bad", text: "TikTok: nothing has been posted yet today." });
  const hooks = (tiktokJob?.details?.hook_photos ?? {}) as Record<string, number>;
  for (const [series, count] of Object.entries(hooks)) if (n(count) < 10) alerts.push({ level: "warn", text: `TikTok "${series}" is down to ${count} hook photos. Add more so hooks don't repeat.` });
  if (jobs.length && queued.pinterest === 0) alerts.push({ level: "warn", text: "Pinterest: no pins are lined up. The 5 AM run schedules the next batch." });
  const igFailed = by("instagram").filter((x) => x.status === "failed" && x.scheduled_for && now - new Date(x.scheduled_for).getTime() < 7 * 86400000);
  if (igFailed.length) {
    const finished = by("instagram").filter((x) => (x.status === "posted" || x.status === "failed") && x.scheduled_for).sort((a, b) => +new Date(b.scheduled_for!) - +new Date(a.scheduled_for!));
    const latestFailed = finished[0]?.status === "failed";
    const sporadic = igFailed.length <= 3 && !latestFailed;
    alerts.push({
      level: sporadic ? "warn" : "bad",
      text: `Instagram: ${igFailed.length} post(s) failed in the last 7 days (Postiz: "${String(igFailed[0].meta.error ?? "unknown error")}").${sporadic ? " The latest posts went out fine, so this looks like a one-off Instagram error." : " The most recent post failed too. Check Postiz."}`,
    });
  }
  if (jobs.length && queued.instagram === 0) alerts.push({ level: "warn", text: "Instagram: nothing is queued in Postiz." });

  // ---- today
  const all = todaySummary(traffic);
  const per = Object.fromEntries(PLATFORMS.map((p) => [p, todaySummary(traffic, p)])) as Record<Platform, ReturnType<typeof todaySummary>>;
  const postsToday = PLATFORMS.reduce((a, p) => a + n(postedMap(p)[today]), 0);
  const postsYesterday = PLATFORMS.reduce((a, p) => a + n(postedMap(p)[yesterday]), 0);

  const sessionSeries = PLATFORMS.map((p) => buildSeries(p, CHANNEL_LABEL[p], traffic.sessions[p], "sum", "int", CHANNEL_COLOR[p]));
  const outboundSeries = PLATFORMS.map((p) => buildSeries(p, CHANNEL_LABEL[p], traffic.outbound[p], "sum", "int", CHANNEL_COLOR[p]));
  const postSeries = PLATFORMS.map((p) => buildSeries(p, CHANNEL_LABEL[p], postedMap(p), "sum", "int", CHANNEL_COLOR[p]));
  const sum = (recs: Record<string, number>[]) => { const o: Record<string, number> = {}; for (const r of recs) for (const [d, v] of Object.entries(r)) o[d] = (o[d] ?? 0) + v; return o; };
  const sessionsAll = sum(PLATFORMS.map((p) => traffic.sessions[p]));
  const outboundAll = sum(PLATFORMS.map((p) => traffic.outbound[p]));
  const postsAll = sum(PLATFORMS.map(postedMap));
  const top = posts.filter((x) => n(x.views) > 0).sort((a, b) => n(b.views) - n(a.views)).slice(0, 8);

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/social" />
      <div className={s.head}>
        <div><h1 className={styles.title}>Social growth</h1><p className={styles.subtitle}>What TikTok, Instagram and Pinterest did today, and what they sent to Street.</p></div>
        <div className={s.stamp}>Eastern time · as of {stamp}</div>
      </div>
      <SocialTabs active="/admin/social" />

      <div className={s.todayGrid}>
        <TodayHero
          label="Visits from social today"
          value={all.visits}
          prevAtNow={all.prevAtNow}
          yesterdayTotal={all.yesterday}
          nowLabel={stamp}
          rows={[["Clicks out to brands", `${all.clicks} (yesterday ${all.clicksYesterday})`], ["Posts published", `${postsToday} (yesterday ${postsYesterday})`], ["Lined up next", `${queued.tiktok + queued.instagram + queued.pinterest} posts`]]}
        />
        <TodayChart
          title="Visits through the day"
          lines={PLATFORMS.map((p) => ({ key: p, label: CHANNEL_LABEL[p], color: CHANNEL_COLOR[p], today: per[p].todayCum }))}
          yesterday={all.yesterdayCum}
        />
      </div>

      <div className={s.chans} style={{ marginTop: 14 }}>
        {PLATFORMS.map((p) => (
          <ChannelCard
            key={p} ch={p} href={`/admin/social/${p}`}
            visits={per[p].visits} prevAtNow={per[p].prevAtNow} yesterdayTotal={per[p].yesterday}
            spark={lastNDays(traffic.sessions[p])}
            facts={[
              ["Clicks out today", String(per[p].clicks)],
              ["Posted today", TARGET[p] ? `${n(postedMap(p)[today])} of ${TARGET[p]}` : String(n(postedMap(p)[today]))],
              ["Lined up", String(queued[p])],
              ["Next up", nextUp(p) ? fmtWhen(nextUp(p)) : "nothing queued"],
            ]}
          />
        ))}
      </div>

      <SectionTitle title="Needs attention" hint={alerts.length ? `${alerts.length} item${alerts.length === 1 ? "" : "s"}` : undefined} />
      <Alerts items={alerts} />

      <SectionTitle title="Traffic over time" hint="Visits that arrived from each channel" />
      <div className={s.two}>
        <SocialChart title="Visits by channel" series={sessionSeries} layout="stack" />
        <SocialChart title="Clicks out to brands" subtitle="what social visitors did next" series={outboundSeries} layout="stack" />
      </div>
      <div style={{ marginTop: 14 }}>
        <CompareTable rows={[
          { label: "Visits from social", c: compareWindows(sessionsAll) },
          { label: "Clicks out to brands", c: compareWindows(outboundAll) },
          { label: "Posts published", c: compareWindows(postsAll) },
        ]} />
      </div>
      {!Object.values(sessionsAll).some((v) => v > 0) ? <p className={s.note} style={{ marginTop: 10 }}>No social visits recorded yet. Pinterest pins are tagged utm_source=pinterest; TikTok and Instagram show up when the app passes a referrer.</p> : null}

      <SectionTitle title="Output" hint="Posts published per period" />
      <SocialChart title="Posts published" series={postSeries} layout="stack" height={200} />

      <SectionTitle title="Are the bots working?" />
      <HealthList jobs={jobs} />

      <SectionTitle title="Best content so far" />
      {top.length ? (
        <div className={s.panel}>
          <table className={styles.table}>
            <thead><tr><th>Channel</th><th>Post</th><th>Series</th><th>Views</th><th>Likes</th><th>Comments</th><th>Posted</th></tr></thead>
            <tbody>{top.map((x) => (
              <tr key={x.platform + x.external_id}><td>{CHANNEL_LABEL[x.platform]}</td><td><div className={s.thumb}>{x.link ? <a href={x.link} target="_blank" rel="noopener noreferrer">{x.hook || x.title}</a> : x.hook || x.title}</div></td><td>{x.series ?? "-"}</td><td><b>{int(n(x.views))}</b></td><td>{int(n(x.likes))}</td><td>{int(n(x.comments))}</td><td>{fmtWhen(x.posted_at)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : <div className={s.empty}>No post has view data yet. TikTok stats are pulled at 7:15 AM and 11:15 PM.</div>}
    </div>
  );
}
