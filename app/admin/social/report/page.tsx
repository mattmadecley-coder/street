import { Fragment } from "react";
import Link from "next/link";
import styles from "@/app/admin/admin.module.css";
import s from "@/app/admin/social/social.module.css";
import r from "@/app/admin/social/report/report.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { SectionTitle, SocialTabs } from "@/components/admin/social-ui";
import { RangeChart } from "@/components/admin/social-range-chart";
import { CHANNEL_COLOR, CHANNEL_LABEL, PLATFORMS, delta, fmtWhen, getJobs, getSocialDaily, getSocialPosts, getTraffic, int, n, nowStamp, todayET, type Platform } from "@/lib/social-dashboard";
import { METRICS, botStats, dailyMetric, dayList, postsInRange, resolveRange, statsFor, totalOf, type ChannelStats, type Metric } from "@/lib/social-report";
import { requireUser } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

const PRESETS = [["today", "Today"], ["yesterday", "Yesterday"], ["7d", "7 days"], ["30d", "30 days"]] as const;

function Chg({ cur, prev }: { cur: number; prev: number }) {
  const d = delta(cur, prev);
  return <small className={r[d.tone]}>{d.text} <span className={r.muted}>vs {int(prev)}</span></small>;
}
function Cell({ cur, prev, na }: { cur: number | null; prev: number | null; na?: string }) {
  if (cur === null) return <td><span className={r.muted}>{na ?? "not tracked"}</span></td>;
  return <td>{int(cur)}{prev === null ? null : <Chg cur={cur} prev={prev} />}</td>;
}

export default async function SocialReportPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string; metric?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const range = resolveRange(sp);
  const metric: Metric = (METRICS.find((m) => m.key === sp.metric)?.key ?? "visits") as Metric;
  const [posts, daily, traffic, jobs] = await Promise.all([getSocialPosts(), getSocialDaily(), getTraffic(), getJobs()]);
  const data = { posts, daily, traffic };

  const cur = Object.fromEntries(PLATFORMS.map((p) => [p, statsFor(p, range.from, range.to, data)])) as Record<Platform, ChannelStats>;
  const prev = Object.fromEntries(PLATFORMS.map((p) => [p, statsFor(p, range.prevFrom, range.prevTo, data)])) as Record<Platform, ChannelStats>;
  const curTotal = totalOf(PLATFORMS.map((p) => cur[p]));
  const prevTotal = totalOf(PLATFORMS.map((p) => prev[p]));

  const days = dayList(range.from, range.to);
  const lines = PLATFORMS.map((p) => ({ ch: p, values: dailyMetric(metric, p, days, data) }));
  const log = postsInRange(posts, range.from, range.to);
  const bot = botStats(daily, range.from, range.to);
  const botPrev = botStats(daily, range.prevFrom, range.prevTo);
  const tiktokPaused = jobs.find((j) => j.job === "tiktok_post")?.last_status === "paused";

  const q = (extra: Record<string, string>) => {
    const u = new URLSearchParams({ range: range.key, ...(range.key === "custom" ? { from: range.from, to: range.to } : {}), ...extra });
    return `/admin/social/report?${u.toString()}`;
  };
  const grouped = new Map<string, typeof log>();
  for (const row of log.slice(0, 150)) grouped.set(row.day, [...(grouped.get(row.day) ?? []), row]);

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/social" />
      <div className={s.head}>
        <div><h1 className={styles.title}>Social growth</h1><p className={styles.subtitle}>Pick any dates and see what went out, who followed, and what it sent to Street.</p></div>
        <div className={s.stamp}>Eastern time · as of {nowStamp()}</div>
      </div>
      <SocialTabs active="/admin/social/report" />

      <div className={r.rangeBar}>
        <div className={r.presets}>
          {PRESETS.map(([key, label]) => <Link key={key} href={`/admin/social/report?range=${key}&metric=${metric}`} data-active={range.key === key ? "true" : undefined}>{label}</Link>)}
        </div>
        <form className={r.custom} method="get" action="/admin/social/report">
          <input type="hidden" name="range" value="custom" />
          <input type="hidden" name="metric" value={metric} />
          <label>From <input type="date" name="from" defaultValue={range.from} max={todayET()} required /></label>
          <label>To <input type="date" name="to" defaultValue={range.to} max={todayET()} required /></label>
          <button type="submit">Apply</button>
        </form>
      </div>

      <p className={r.summary}>
        Showing <b>{range.label}</b>{range.days > 1 ? ` (${range.days} days)` : ""}{range.includesToday ? ", today is still in progress" : ""}. Each number is compared with the {range.days === 1 ? "day" : `${range.days} days`} before it ({range.prevFrom === range.prevTo ? range.prevFrom : `${range.prevFrom} to ${range.prevTo}`}).
      </p>

      <div className={r.panel}>
        <div className={r.tableWrap}>
          <table className={r.table}>
            <thead><tr><th>Channel</th><th>Posts published</th><th>Views on those posts</th><th>Followers gained</th><th>Visits to Street</th><th>Clicks out to brands</th></tr></thead>
            <tbody>
              {PLATFORMS.map((p) => (
                <tr key={p}>
                  <td><span className={r.chanName}><i style={{ background: CHANNEL_COLOR[p] }} />{CHANNEL_LABEL[p]}{p === "tiktok" && tiktokPaused ? <span className={r.paused}>paused</span> : null}</span></td>
                  <Cell cur={cur[p].posts} prev={prev[p].posts} />
                  <Cell cur={cur[p].views} prev={prev[p].views} />
                  <Cell cur={cur[p].followersGained} prev={prev[p].followersGained} />
                  <Cell cur={cur[p].visits} prev={prev[p].visits} />
                  <Cell cur={cur[p].clicks} prev={prev[p].clicks} />
                </tr>
              ))}
              <tr className={r.total}>
                <td>All channels</td>
                <Cell cur={curTotal.posts} prev={prevTotal.posts} />
                <Cell cur={curTotal.views} prev={prevTotal.views} />
                <Cell cur={curTotal.followersGained} prev={prevTotal.followersGained} />
                <Cell cur={curTotal.visits} prev={prevTotal.visits} />
                <Cell cur={curTotal.clicks} prev={prevTotal.clicks} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p className={r.note}>
        Views count the posts <i>published</i> in these dates (a platform reports a post&apos;s lifetime views, not views per day). Visits and clicks are measured on Street itself. Follower counts are only recorded for Instagram so far, so TikTok and Pinterest show &quot;not tracked&quot;.
      </p>

      <SectionTitle title="Over time" hint={`${days[0]} to ${days[days.length - 1]}`} />
      <div className={r.metricTabs}>
        {METRICS.map((m) => <Link key={m.key} href={q({ metric: m.key })} data-active={m.key === metric ? "true" : undefined}>{m.label}</Link>)}
      </div>
      <RangeChart title={METRICS.find((m) => m.key === metric)!.label} days={days} lines={lines} />

      <SectionTitle title="Instagram follow bot" hint="Follow and unfollow activity in these dates" />
      <div className={r.botGrid}>
        <div className={r.kpi}><span>Follows made</span><strong>{int(bot.followsMade)}</strong><Chg cur={bot.followsMade} prev={botPrev.followsMade} /></div>
        <div className={r.kpi}><span>Unfollows made</span><strong>{int(bot.unfollowsMade)}</strong><Chg cur={bot.unfollowsMade} prev={botPrev.unfollowsMade} /></div>
        <div className={r.kpi}><span>Followed back</span><strong>{int(bot.followBacks)}</strong><small>{bot.followsMade ? `${Math.round((bot.followBacks / bot.followsMade) * 100)}% of follows made` : "no follows in range"}</small></div>
        <div className={r.kpi}><span>Following now</span><strong>{bot.followingEnd === null ? "-" : int(bot.followingEnd)}</strong><small>{bot.followersEnd === null ? "" : `${int(bot.followersEnd)} followers`}</small></div>
      </div>

      <SectionTitle title="What went out" hint={log.length ? `${log.length} post${log.length === 1 ? "" : "s"}${log.length > 150 ? " (newest 150 shown)" : ""}` : undefined} />
      <div className={r.panel}>
        {log.length ? (
          <div className={r.tableWrap}>
            <table className={r.table}>
              <thead><tr><th>Channel</th><th>Post</th><th>Series</th><th>Views</th><th>Likes</th><th>Time</th></tr></thead>
              <tbody>
                {[...grouped.entries()].map(([day, rows]) => (
                  <Fragment key={day}>
                    <tr className={r.dayHead}><td colSpan={6}>{day} · {rows.length} post{rows.length === 1 ? "" : "s"}</td></tr>
                    {rows.map(({ platform, post }) => (
                      <tr key={platform + post.external_id}>
                        <td><span className={r.chanName}><i style={{ background: CHANNEL_COLOR[platform] }} />{CHANNEL_LABEL[platform]}</span></td>
                        <td className={r.postCell}>{post.link ? <a href={post.link} target="_blank" rel="noopener noreferrer">{post.hook || post.title || post.external_id}</a> : post.hook || post.title || post.external_id}</td>
                        <td>{post.series ?? "-"}</td>
                        <td>{n(post.views) ? int(n(post.views)) : "-"}</td>
                        <td>{n(post.likes) ? int(n(post.likes)) : "-"}</td>
                        <td>{fmtWhen(post.posted_at ?? post.scheduled_for)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className={r.empty}>Nothing was published in these dates.</div>}
      </div>
    </div>
  );
}
