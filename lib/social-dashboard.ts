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
export type Series = { key: string; label: string; format?: "int" | "pct"; day: Pt[]; week: Pt[]; month: Pt[] };

/** map: day -> value. agg "sum" adds within a bucket; "last" keeps the latest day's value (for running totals like followers). */
export function buildSeries(key: string, label: string, map: Record<string, number>, agg: "sum" | "last" = "sum", format: "int" | "pct" = "int"): Series {
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
  return { key, label, format, day: days, week: weeks, month: months };
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

export type Traffic = {
  /** per channel: day -> value */
  visitors: Record<Platform, Record<string, number>>;
  sessions: Record<Platform, Record<string, number>>;
  outbound: Record<Platform, Record<string, number>>;
  campaigns: Array<CampaignRow & { channel: Platform }>;
};

export async function getTraffic(): Promise<Traffic> {
  const empty = () => ({ tiktok: {}, instagram: {}, pinterest: {} }) as Record<Platform, Record<string, number>>;
  const t: Traffic = { visitors: empty(), sessions: empty(), outbound: empty(), campaigns: [] };
  if (!hasSupabaseCatalog()) return t;
  const since = addDays(todayET(), -400);
  const rows = await restAll<CampaignRow>(`analytics_campaign_daily?select=*&day=gte.${since}`, 1000, 20000).catch(() => []);
  const seenSessions = new Set<string>();
  for (const r of rows) {
    const ch = channelOfSource(r.utm_source);
    if (!ch) continue;
    t.visitors[ch][r.day] = (t.visitors[ch][r.day] ?? 0) + n(r.visitors);
    t.sessions[ch][r.day] = (t.sessions[ch][r.day] ?? 0) + n(r.sessions);
    t.outbound[ch][r.day] = (t.outbound[ch][r.day] ?? 0) + n(r.outbound_clicks);
    t.campaigns.push({ ...r, channel: ch });
  }
  // Referrer-based visits (TikTok bios/captions are not tagged links, so these arrive as a plain referrer).
  const since30 = new Date(Date.now() - 90 * 86400000).toISOString();
  const events = await restAll<{ created_at: string; session_id: string; referrer: string | null; utm_source: string | null }>(
    `site_events?select=created_at,session_id,referrer,utm_source&event_type=eq.page_view&created_at=gte.${since30}&referrer=not.is.null&or=(referrer.ilike.*tiktok*,referrer.ilike.*instagram*,referrer.ilike.*pinterest*,referrer.ilike.*pin.it*)`,
    1000, 20000,
  ).catch(() => []);
  for (const e of events) {
    if (e.utm_source && channelOfSource(e.utm_source)) continue; // already counted via the tagged campaign
    const ch = channelOfReferrer(e.referrer);
    if (!ch || seenSessions.has(e.session_id)) continue;
    seenSessions.add(e.session_id);
    const d = etDay(e.created_at);
    t.sessions[ch][d] = (t.sessions[ch][d] ?? 0) + 1;
    t.visitors[ch][d] = (t.visitors[ch][d] ?? 0) + 1;
  }
  return t;
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
