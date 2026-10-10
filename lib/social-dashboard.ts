// Data layer for /admin/social (TikTok / Instagram / Pinterest growth dashboards).
// The posting bots run on Matthew's PC; scripts/sync_dashboard.py there pushes their state into
// social_posts / social_daily / automation_jobs / ig_follow_log every hour. Traffic comes from the
// site's own analytics (analytics_campaign_daily + site_events referrers), so it is measured on Street.

import { hasSupabaseCatalog, supabaseRest, supabaseRestPage } from "@/lib/supabase-rest";

/** Live (uncached) paged read - dashboards must show what the bots just wrote, not a 1-hour-old copy. */
async function restAll<T>(path: string, pageSize = 1000, maxItems = 20000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < maxItems; from += pageSize) {
    const page = await supabaseRestPage<T>(path, { from, to: from + pageSize - 1 }, { noStore: true });
    out.push(...page.data);
    if (page.data.length < pageSize) break;
  }
  return out;
}
export type Platform = "tiktok" | "instagram" | "pinterest";
export const PLATFORMS: Platform[] = ["tiktok", "instagram", "pinterest"];

export type SocialPost = {
  platform: Platform; external_id: string; kind: string | null; series: string | null; hook: string | null; title: string | null;
  status: string; scheduled_for: string | null; posted_at: string | null; link: string | null;
  views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null; clicks: number | null;
  meta: Record<string, unknown>; updated_at: string;
};
export type SocialDaily = { day: string; platform: Platform; metric: string; value: number };
export type AutomationJob = {
  job: string; platform: Platform | null; last_run_at: string | null; last_success_at: string | null; last_status: string | null;
  last_message: string | null; expected_every_minutes: number | null; details: Record<string, unknown>; updated_at: string;
};
export type FollowLog = { username: string; followed_at: string; followed_back: boolean | null; checked_at: string | null; unfollowed_at: string | null };
type CampaignRow = { day: string; utm_source: string; utm_medium: string; utm_campaign: string; utm_content: string; visitors: number; sessions: number; page_views: number; product_views: number; outbound_clicks: number; outbound_sessions: number };

const TZ = "America/New_York";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
export const etDay = (d: Date | string) => dayFmt.format(new Date(d));
export const todayET = () => etDay(new Date());
export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekStart(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -dow);
}
const monthKey = (day: string) => day.slice(0, 7);
const shortDay = (day: string) => { const [, m, d] = day.split("-"); return `${Number(m)}/${Number(d)}`; };

export const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

// ---------------------------------------------------------------- series + comparisons
export type Pt = { x: string; y: number };
export type Series = { key: string; label: string; color?: string; format?: "int" | "pct"; day: Pt[]; week: Pt[]; month: Pt[] };
/** Fixed identity colors (validated categorical slots 1-3). A channel is always this color, everywhere. */
export const CHANNEL_COLOR: Record<Platform, string> = { tiktok: "#2a78d6", instagram: "#eb6834", pinterest: "#1baf7a" };
export const CHANNEL_LABEL: Record<Platform, string> = { tiktok: "TikTok", instagram: "Instagram", pinterest: "Pinterest" };

/** map: day -> value. agg "sum" adds within a bucket; "last" keeps the latest day's value (for running totals like followers). */
export function buildSeries(key: string, label: string, map: Record<string, number>, agg: "sum" | "last" = "sum", format: "int" | "pct" = "int", color?: string): Series {
  const today = todayET();
  const days: Pt[] = [];
  for (let i = 29; i >= 0; i--) { const d = addDays(today, -i); days.push({ x: shortDay(d), y: n(map[d]) }); }
  const weeks: Pt[] = [];
  const curWeek = weekStart(today);
  for (let i = 11; i >= 0; i--) {
    const start = addDays(curWeek, -7 * i);
    let y = 0;
    for (let k = 0; k < 7; k++) {
      const v = map[addDays(start, k)];
      if (v === undefined) continue;
      y = agg === "sum" ? y + n(v) : n(v);
    }
    weeks.push({ x: `wk ${shortDay(start)}`, y });
  }
  const months: Pt[] = [];
  const base = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() - i);
    const mk = d.toISOString().slice(0, 7);
    let y = 0;
    for (const [day, v] of Object.entries(map).sort(([a], [b]) => a.localeCompare(b))) {
      if (monthKey(day) !== mk) continue;
      y = agg === "sum" ? y + n(v) : n(v);
    }
    months.push({ x: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }), y });
  }
  return { key, label, color, format, day: days, week: weeks, month: months };
}

export type Comparison = { today: number; yesterday: number; last7: number; prev7: number; last30: number; prev30: number };
export function compareWindows(map: Record<string, number>): Comparison {
  const today = todayET();
  const sum = (from: number, to: number) => { let t = 0; for (let i = from; i <= to; i++) t += n(map[addDays(today, -i)]); return t; };
  return { today: sum(0, 0), yesterday: sum(1, 1), last7: sum(0, 6), prev7: sum(7, 13), last30: sum(0, 29), prev30: sum(30, 59) };
}

export function countByDay<T>(rows: T[], dayOf: (r: T) => string | null, weight: (r: T) => number = () => 1) {
  const out: Record<string, number> = {};
  for (const r of rows) { const d = dayOf(r); if (d) out[d] = (out[d] ?? 0) + weight(r); }
  return out;
}

// ---------------------------------------------------------------- fetchers
export async function getSocialPosts(platform?: Platform, includeHistory = false): Promise<SocialPost[]> {
  if (!hasSupabaseCatalog()) return [];
  // Instagram carousels exist twice: the Postiz post and our own history row. Counts use Postiz rows only;
  // history rows (category/brand detail) are opt-in so nothing is double counted.
  const filter = (platform ? `&platform=eq.${platform}` : "") + (includeHistory ? "" : "&or=(platform.neq.instagram,kind.neq.carousel)");
  return restAll<SocialPost>(`social_posts?select=*${filter}&order=posted_at.desc.nullslast`, 1000, 5000).catch(() => []);
}
export async function getSocialDaily(platform?: Platform): Promise<SocialDaily[]> {
  if (!hasSupabaseCatalog()) return [];
  const since = addDays(todayET(), -400);
  const filter = platform ? `&platform=eq.${platform}` : "";
  return restAll<SocialDaily>(`social_daily?select=day,platform,metric,value&day=gte.${since}${filter}`, 1000, 20000).catch(() => []);
}
export async function getJobs(): Promise<AutomationJob[]> {
  if (!hasSupabaseCatalog()) return [];
  return supabaseRest<AutomationJob[]>("automation_jobs?select=*&order=job.asc", { noStore: true }).catch(() => []);
}
export async function getFollowLog(): Promise<FollowLog[]> {
  if (!hasSupabaseCatalog()) return [];
  return restAll<FollowLog>("ig_follow_log?select=*&order=followed_at.desc", 1000, 10000).catch(() => []);
}

/** Which social channel an analytics campaign row belongs to (by utm_source). */
export function channelOfSource(source: string): Platform | null {
  const s = (source ?? "").toLowerCase();
  if (s === "pinterest" || s === "pin") return "pinterest";
  if (s === "ig" || s === "instagram" || s === "insta") return "instagram";
  if (s === "tiktok" || s === "tt") return "tiktok";
  return null;
}
export function channelOfReferrer(referrer: string | null): Platform | null {
  const r = (referrer ?? "").toLowerCase();
  if (/pinterest\./.test(r) || /pin\.it/.test(r)) return "pinterest";
  if (/instagram\.com|l\.instagram\.com/.test(r)) return "instagram";
  if (/tiktok\.com/.test(r)) return "tiktok";
  return null;
}

export type Visit = { ch: Platform; t: number; day: string; session: string; user: string; campaign: string };
export type Click = { ch: Platform; t: number; day: string; session: string; campaign: string; brand: string | null; product: string | null };
export type Traffic = {
  visits: Visit[];
  clicks: Click[];
  /** per channel: day -> value (Eastern days) */
  visitors: Record<Platform, Record<string, number>>;
  sessions: Record<Platform, Record<string, number>>;
  outbound: Record<Platform, Record<string, number>>;
};

const MIN_FMT = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "numeric", hour12: false });
/** Minutes since local (Eastern) midnight for a timestamp. */
export function etMinutes(ms: number) {
  const parts = MIN_FMT.formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === "hour")?.value) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return h * 60 + m;
}
export const nowMinutes = () => etMinutes(Date.now());

const SRC_IN = "pinterest,pin,ig,instagram,insta,tiktok,tt";

/**
 * Social traffic measured on Street itself. A session counts for a channel when its landing event carries that
 * channel's utm_source, or (no utm) arrives with that site as the referrer. Times are exact, so "today so far"
 * can be compared with "yesterday at this time".
 */
export async function getTraffic(): Promise<Traffic> {
  const empty = () => ({ tiktok: {}, instagram: {}, pinterest: {} }) as Record<Platform, Record<string, number>>;
  const t: Traffic = { visits: [], clicks: [], visitors: empty(), sessions: empty(), outbound: empty() };
  if (!hasSupabaseCatalog()) return t;
  const since = new Date(Date.now() - 120 * 86400000).toISOString();
  type Ev = { created_at: string; session_id: string; anonymous_user_id: string | null; referrer: string | null; utm_source: string | null; utm_campaign: string | null };
  const events = await restAll<Ev>(
    `site_events?select=created_at,session_id,anonymous_user_id,referrer,utm_source,utm_campaign&created_at=gte.${since}` +
    `&or=(utm_source.in.(${SRC_IN}),referrer.ilike.*tiktok*,referrer.ilike.*instagram*,referrer.ilike.*pinterest*,referrer.ilike.*pin.it*)&order=created_at.asc`,
    1000, 30000,
  ).catch(() => [] as Ev[]);
  const bySession = new Map<string, Platform>();
  const users = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.session_id || bySession.has(e.session_id)) continue;
    const ch = channelOfSource(e.utm_source ?? "") ?? channelOfReferrer(e.referrer);
    if (!ch) continue;
    bySession.set(e.session_id, ch);
    const ms = new Date(e.created_at).getTime();
    const day = etDay(e.created_at);
    t.visits.push({ ch, t: ms, day, session: e.session_id, user: e.anonymous_user_id ?? e.session_id, campaign: e.utm_campaign ?? "" });
    t.sessions[ch][day] = (t.sessions[ch][day] ?? 0) + 1;
    const key = `${ch}|${day}`;
    const set = users.get(key) ?? new Set<string>();
    if (!set.has(e.anonymous_user_id ?? e.session_id)) { set.add(e.anonymous_user_id ?? e.session_id); t.visitors[ch][day] = (t.visitors[ch][day] ?? 0) + 1; }
    users.set(key, set);
  }
  type Oc = { created_at: string; session_id: string | null; referrer: string | null; utm_source: string | null; utm_campaign: string | null; brand_slug: string | null; product_title: string | null };
  const clicks = await restAll<Oc>(`outbound_clicks?select=created_at,session_id,referrer,utm_source,utm_campaign,brand_slug,product_title&created_at=gte.${since}`, 1000, 20000).catch(() => [] as Oc[]);
  for (const c of clicks) {
    const ch = (c.session_id ? bySession.get(c.session_id) : undefined) ?? channelOfSource(c.utm_source ?? "") ?? channelOfReferrer(c.referrer);
    if (!ch) continue;
    const day = etDay(c.created_at);
    t.clicks.push({ ch, t: new Date(c.created_at).getTime(), day, session: c.session_id ?? "", campaign: c.utm_campaign ?? "", brand: c.brand_slug, product: c.product_title });
    t.outbound[ch][day] = (t.outbound[ch][day] ?? 0) + 1;
  }
  return t;
}

/** Cumulative count at the end of each hour of `day` (null for hours that haven't happened yet today). */
export function cumulativeByHour(items: Array<{ t: number; day: string }>, day: string, ch?: Platform, chOf?: (i: never) => Platform): (number | null)[] {
  void chOf;
  const per = new Array(24).fill(0);
  for (const i of items as Array<{ t: number; day: string; ch?: Platform }>) {
    if (i.day !== day || (ch && i.ch !== ch)) continue;
    per[Math.floor(etMinutes(i.t) / 60)] += 1;
  }
  const isToday = day === todayET();
  const nowH = Math.floor(nowMinutes() / 60);
  let run = 0;
  return per.map((v, h) => { run += v; return isToday && h > nowH ? null : run; });
}
/** How many happened on `day` up to the given minute of the day. */
export function countUpTo(items: Array<{ t: number; day: string; ch?: Platform }>, day: string, minutes: number, ch?: Platform) {
  let c = 0;
  for (const i of items) if (i.day === day && (!ch || i.ch === ch) && etMinutes(i.t) <= minutes) c += 1;
  return c;
}
export function lastNDays(map: Record<string, number>, days = 14): number[] {
  const today = todayET();
  return Array.from({ length: days }, (_, k) => n(map[addDays(today, -(days - 1 - k))]));
}

// ---------------------------------------------------------------- health
export type Health = "ok" | "warn" | "bad" | "pending";
export function jobHealth(job: AutomationJob): { level: Health; label: string } {
  const status = (job.last_status ?? "").toLowerCase();
  if (status === "pending") return { level: "pending", label: "Waiting for first run" };
  if (status === "failed") return { level: "bad", label: "Failed" };
  const exp = (job.expected_every_minutes ?? 0) * 60000;
  const ref = job.last_success_at ?? job.last_run_at;
  if (exp && ref && Date.now() - new Date(ref).getTime() > exp * 1.5) return { level: "bad", label: "Stale - hasn't reported on time" };
  if (!ref && status !== "ok") return { level: "pending", label: "No runs recorded yet" };
  if (status === "partial" || status === "stale") return { level: "warn", label: status === "partial" ? "Partly working" : "Running but quiet" };
  return { level: "ok", label: "Healthy" };
}

export function ago(iso: string | null | undefined) {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
export function fmtWhen(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ---------------------------------------------------------------- content performance
export type GroupStat = { key: string; posts: number; views: number; likes: number; comments: number; avgViews: number; engagement: number };
export function groupPosts(posts: SocialPost[], keyOf: (p: SocialPost) => string | null | undefined): GroupStat[] {
  const map = new Map<string, GroupStat>();
  for (const p of posts) {
    const k = keyOf(p);
    if (!k) continue;
    const g = map.get(k) ?? { key: k, posts: 0, views: 0, likes: 0, comments: 0, avgViews: 0, engagement: 0 };
    g.posts += 1; g.views += n(p.views); g.likes += n(p.likes); g.comments += n(p.comments);
    map.set(k, g);
  }
  return [...map.values()].map((g) => ({ ...g, avgViews: g.posts ? g.views / g.posts : 0, engagement: g.views ? (g.likes + g.comments) / g.views : 0 }))
    .sort((a, b) => b.avgViews - a.avgViews || b.posts - a.posts);
}

export const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
export const int = (v: number) => Math.round(v).toLocaleString("en-US");
export function delta(cur: number, prev: number) {
  if (!prev && !cur) return { text: "no change", tone: "flat" as const };
  if (!prev) return { text: "new", tone: "up" as const };
  const p = (cur - prev) / prev;
  return { text: `${p >= 0 ? "+" : ""}${(p * 100).toFixed(0)}%`, tone: p > 0.005 ? ("up" as const) : p < -0.005 ? ("down" as const) : ("flat" as const) };
}

// ---------------------------------------------------------------- "today" summary
export type TodaySummary = {
  visits: number; prevAtNow: number; yesterday: number;
  clicks: number; clicksYesterday: number;
  todayCum: (number | null)[]; yesterdayCum: number[];
};
export function todaySummary(t: Traffic, ch?: Platform): TodaySummary {
  const today = todayET();
  const yest = addDays(today, -1);
  const mins = nowMinutes();
  const v = ch ? t.visits.filter((x) => x.ch === ch) : t.visits;
  const c = ch ? t.clicks.filter((x) => x.ch === ch) : t.clicks;
  return {
    visits: countUpTo(v, today, 24 * 60), prevAtNow: countUpTo(v, yest, mins), yesterday: countUpTo(v, yest, 24 * 60),
    clicks: countUpTo(c, today, 24 * 60), clicksYesterday: countUpTo(c, yest, 24 * 60),
    todayCum: cumulativeByHour(v, today), yesterdayCum: cumulativeByHour(v, yest).map((x) => x ?? 0),
  };
}
export const nowStamp = () => new Date().toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
