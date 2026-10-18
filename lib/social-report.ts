// Range reporting for /admin/social/report: pick a window (today, yesterday, 7d, 30d, custom), compare it with the
// window of equal length right before it, and roll posts / views / followers / visits / clicks up per channel.
// Pure functions over the rows lib/social-dashboard.ts already fetches, so they are easy to test.

import { PLATFORMS, addDays, etDay, n, todayET, type Platform, type SocialDaily, type SocialPost, type Traffic } from "@/lib/social-dashboard";

export type RangeKey = "today" | "yesterday" | "7d" | "30d" | "custom";
export type Range = { key: RangeKey; from: string; to: string; days: number; label: string; prevFrom: string; prevTo: string; includesToday: boolean };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;
const validDay = (s: string | undefined): s is string => !!s && DAY_RE.test(s) && !Number.isNaN(new Date(`${s}T12:00:00Z`).getTime());
export const daysBetween = (from: string, to: string) => Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86400000) + 1;

export function resolveRange(sp: { range?: string; from?: string; to?: string }, today = todayET()): Range {
  let key: RangeKey = (["today", "yesterday", "7d", "30d", "custom"] as const).includes(sp.range as RangeKey) ? (sp.range as RangeKey) : "7d";
  let from = today, to = today, label = "Today";
  if (key === "yesterday") { from = to = addDays(today, -1); label = "Yesterday"; }
  else if (key === "7d") { from = addDays(today, -6); label = "Last 7 days"; }
  else if (key === "30d") { from = addDays(today, -29); label = "Last 30 days"; }
  else if (key === "custom") {
    if (validDay(sp.from) && validDay(sp.to)) {
      from = sp.from; to = sp.to;
      if (from > to) [from, to] = [to, from];
      if (to > today) to = today;
      if (from > to) from = to;
      if (daysBetween(from, to) > MAX_DAYS) from = addDays(to, -(MAX_DAYS - 1));
      label = from === to ? from : `${from} to ${to}`;
    } else { key = "7d"; from = addDays(today, -6); label = "Last 7 days"; }
  }
  const days = daysBetween(from, to);
  return { key, from, to, days, label, prevFrom: addDays(from, -days), prevTo: addDays(from, -1), includesToday: to === today };
}

export function dayList(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export type ChannelStats = {
  posts: number;
  views: number;
  likes: number;
  followersGained: number | null; // null = this channel's follower count isn't tracked (or no reading in/around the window)
  followersEnd: number | null;
  visits: number;
  visitors: number;
  clicks: number;
};
export type Metric = "posts" | "views" | "visits" | "clicks";
export const METRICS: Array<{ key: Metric; label: string }> = [
  { key: "visits", label: "Visits to Street" },
  { key: "clicks", label: "Clicks out to brands" },
  { key: "posts", label: "Posts published" },
  { key: "views", label: "Views" },
];

/** Day a post counts as published (Pinterest pins publish themselves once their scheduled time passes). */
export function publishedDay(p: SocialPost, now = Date.now()): string | null {
  if (p.platform === "pinterest") {
    const when = p.scheduled_for ?? p.posted_at;
    if (!when) return null;
    if (p.status === "posted" || (p.status === "scheduled" && new Date(when).getTime() <= now)) return etDay(when);
    return null;
  }
  return p.status === "posted" && p.posted_at ? etDay(p.posted_at) : null;
}

function followerSeries(daily: SocialDaily[], ch: Platform) {
  const m = new Map<string, number>();
  for (const r of daily) if (r.platform === ch && r.metric === "followers") m.set(r.day, n(r.value));
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
}
/** Followers gained in [from, to]: end-of-window reading minus the last reading before the window (or the first reading inside it). */
export function followersGained(daily: SocialDaily[], ch: Platform, from: string, to: string): { gained: number | null; end: number | null } {
  const s = followerSeries(daily, ch);
  const inWin = s.filter(([d]) => d >= from && d <= to);
  if (!inWin.length) return { gained: null, end: null };
  const before = [...s].reverse().find(([d]) => d < from);
  const start = before ? before[1] : inWin[0][1];
  const end = inWin[inWin.length - 1][1];
  return { gained: end - start, end };
}

export type PostRow = { day: string; platform: Platform; post: SocialPost };

export function statsFor(ch: Platform, from: string, to: string, d: { posts: SocialPost[]; daily: SocialDaily[]; traffic: Traffic }): ChannelStats {
  const inRange = (day: string | null) => !!day && day >= from && day <= to;
  const mine = d.posts.filter((p) => p.platform === ch && inRange(publishedDay(p)));
  const sumMap = (m: Record<string, number>) => dayList(from, to).reduce((a, day) => a + n(m[day]), 0);
  const f = followersGained(d.daily, ch, from, to);
  return {
    posts: mine.length,
    views: mine.reduce((a, p) => a + n(p.views), 0),
    likes: mine.reduce((a, p) => a + n(p.likes), 0),
    followersGained: f.gained,
    followersEnd: f.end,
    visits: sumMap(d.traffic.sessions[ch]),
    visitors: sumMap(d.traffic.visitors[ch]),
    clicks: sumMap(d.traffic.outbound[ch]),
  };
}

export function totalOf(rows: ChannelStats[]): ChannelStats {
  const tracked = rows.filter((r) => r.followersGained !== null);
  return {
    posts: rows.reduce((a, r) => a + r.posts, 0),
    views: rows.reduce((a, r) => a + r.views, 0),
    likes: rows.reduce((a, r) => a + r.likes, 0),
    followersGained: tracked.length ? tracked.reduce((a, r) => a + (r.followersGained ?? 0), 0) : null,
    followersEnd: tracked.length ? tracked.reduce((a, r) => a + (r.followersEnd ?? 0), 0) : null,
    visits: rows.reduce((a, r) => a + r.visits, 0),
    visitors: rows.reduce((a, r) => a + r.visitors, 0),
    clicks: rows.reduce((a, r) => a + r.clicks, 0),
  };
}

/** Per-day value of one metric for one channel across the window. */
export function dailyMetric(metric: Metric, ch: Platform, days: string[], d: { posts: SocialPost[]; traffic: Traffic }): number[] {
  if (metric === "visits") return days.map((x) => n(d.traffic.sessions[ch][x]));
  if (metric === "clicks") return days.map((x) => n(d.traffic.outbound[ch][x]));
  const by: Record<string, number> = {};
  for (const p of d.posts) {
    if (p.platform !== ch) continue;
    const day = publishedDay(p);
    if (!day) continue;
    by[day] = (by[day] ?? 0) + (metric === "posts" ? 1 : n(p.views));
  }
  return days.map((x) => n(by[x]));
}

export function postsInRange(posts: SocialPost[], from: string, to: string): PostRow[] {
  const out: PostRow[] = [];
  for (const p of posts) {
    const day = publishedDay(p);
    if (day && day >= from && day <= to) out.push({ day, platform: p.platform, post: p });
  }
  return out.sort((a, b) => b.day.localeCompare(a.day) || (b.post.posted_at ?? b.post.scheduled_for ?? "").localeCompare(a.post.posted_at ?? a.post.scheduled_for ?? ""));
}

export type BotStats = { followsMade: number; unfollowsMade: number; followBacks: number; followingEnd: number | null; followersEnd: number | null };
/** Instagram follow-bot activity from social_daily (follows_made / unfollows_made / follow_backs / following / followers). */
export function botStats(daily: SocialDaily[], from: string, to: string): BotStats {
  const sum = (metric: string) => daily.filter((r) => r.platform === "instagram" && r.metric === metric && r.day >= from && r.day <= to).reduce((a, r) => a + n(r.value), 0);
  const last = (metric: string) => {
    const rows = daily.filter((r) => r.platform === "instagram" && r.metric === metric && r.day <= to).sort((a, b) => a.day.localeCompare(b.day));
    return rows.length ? n(rows[rows.length - 1].value) : null;
  };
  return { followsMade: sum("follows_made"), unfollowsMade: sum("unfollows_made"), followBacks: sum("follow_backs"), followingEnd: last("following"), followersEnd: last("followers") };
}

export { PLATFORMS };
