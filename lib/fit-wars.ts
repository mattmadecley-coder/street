import { createHash } from "node:crypto";
import { supabaseRest, supabaseRestAll, supabaseRestPage } from "@/lib/supabase-rest";
import { siteUrl } from "@/lib/email-products";

export type FitWarsStatus = "draft" | "active" | "paused" | "archived";
export type FitWarsSourceType = "upload" | "url" | "instagram";
export type FitWarsPermissionStatus = "pending" | "approved" | "rejected" | "removed";

export type FitWarsCampaign = {
  id: string;
  school_name: string;
  code: string;
  label: string;
  headline: string;
  status: FitWarsStatus;
  audience_type: "high_school" | "adult_opt_in";
  results_headline: string;
  results_copy: string;
  results_note: string;
  marketing_label: string;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  archived_at: string | null;
};

export type FitWarsOutfit = {
  id: string;
  campaign_id: string;
  display_name: string;
  image_url: string;
  source_type: FitWarsSourceType;
  source_url: string | null;
  instagram_url: string | null;
  permission_status: FitWarsPermissionStatus;
  permission_note: string | null;
  is_active: boolean;
};

export type FitWarsMatchup = {
  id: string;
  campaign_id: string;
  position: number;
  left_outfit_id: string;
  right_outfit_id: string;
  duration_ms: number;
  is_active: boolean;
};

export type FitWarsCommentary = {
  id: string;
  matchup_id: string;
  body: string;
  link_label: string | null;
  link_url: string | null;
  is_active: boolean;
  position: number;
};

export type FitWarsPublicMatchup = FitWarsMatchup & {
  left: Pick<FitWarsOutfit, "id" | "display_name" | "image_url">;
  right: Pick<FitWarsOutfit, "id" | "display_name" | "image_url">;
  messages: FitWarsCommentary[];
};

export type FitWarsExperience = {
  campaign: FitWarsCampaign;
  matchups: FitWarsPublicMatchup[];
  publicUrl: string;
};

export type FitWarsLeaderboardRow = {
  outfitId: string;
  displayName: string;
  imageUrl: string;
  votes: number;
  percentage: number;
};

export type FitWarsStats = {
  visitors: number;
  uniqueVisitors: number;
  votes: number;
  completionRate: number;
  emailRequests: number;
  marketingOptIns: number;
  streetClicks: number;
  shares: number;
};

export type FitWarsAdminData = {
  campaign: FitWarsCampaign;
  outfits: FitWarsOutfit[];
  matchups: Array<FitWarsMatchup & { left: FitWarsOutfit | null; right: FitWarsOutfit | null; messages: FitWarsCommentary[] }>;
  leaderboard: FitWarsLeaderboardRow[];
  stats: FitWarsStats;
};

const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export function cleanCampaignCode(value: unknown): string {
  return text(value, 32).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function isCampaignCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{1,31}$/.test(value);
}

export function cleanFitWarsText(value: unknown, max = 240): string {
  return text(value, max).replace(/[<>]/g, "");
}

export function cleanPublicUrl(value: unknown): string | null {
  const raw = text(value, 1000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host.endsWith(".local")) return null;
    if (/^(10|127)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function hashVisitor(value: string): string {
  const salt = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "street-fit-wars";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

export function publicCampaignUrl(code: string) {
  return `${siteUrl()}/f/${encodeURIComponent(code)}`;
}

async function campaignById(id: string) {
  const rows = await supabaseRest<FitWarsCampaign[]>(`fit_wars_campaigns?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { noStore: true });
  return rows[0] ?? null;
}

export async function getCampaignByCode(code: string, includeInactive = false): Promise<FitWarsCampaign | null> {
  if (!isCampaignCode(code)) return null;
  const statusFilter = includeInactive ? "" : "&status=eq.active";
  const rows = await supabaseRest<FitWarsCampaign[]>(`fit_wars_campaigns?code=eq.${encodeURIComponent(code)}${statusFilter}&select=*&limit=1`, { noStore: true });
  return rows[0] ?? null;
}

export async function getCampaignExperience(code: string, includeInactive = false): Promise<FitWarsExperience | null> {
  const campaign = await getCampaignByCode(code, includeInactive);
  if (!campaign) return null;

  const [outfits, matchups] = await Promise.all([
    supabaseRest<FitWarsOutfit[]>(`fit_wars_outfits?campaign_id=eq.${campaign.id}&is_active=eq.true&permission_status=eq.approved&select=*&order=created_at.asc`, { noStore: true }),
    supabaseRest<FitWarsMatchup[]>(`fit_wars_matchups?campaign_id=eq.${campaign.id}&is_active=eq.true&select=*&order=position.asc`, { noStore: true }),
  ]);
  const comments = matchups.length
    ? await supabaseRest<FitWarsCommentary[]>(`fit_wars_commentaries?matchup_id=in.(${matchups.map((matchup) => matchup.id).join(",")})&is_active=eq.true&select=*&order=position.asc`, { noStore: true })
    : [];
  const outfitById = new Map(outfits.map((outfit) => [outfit.id, outfit]));
  const commentsByMatchup = new Map<string, FitWarsCommentary[]>();
  for (const comment of comments) commentsByMatchup.set(comment.matchup_id, [...(commentsByMatchup.get(comment.matchup_id) ?? []), comment]);

  const publicMatchups = matchups.flatMap((matchup) => {
    const left = outfitById.get(matchup.left_outfit_id);
    const right = outfitById.get(matchup.right_outfit_id);
    if (!left || !right) return [];
    return [{
      ...matchup,
      left: { id: left.id, display_name: left.display_name, image_url: left.image_url },
      right: { id: right.id, display_name: right.display_name, image_url: right.image_url },
      messages: commentsByMatchup.get(matchup.id) ?? [],
    }];
  });
  if (!publicMatchups.length) return null;
  return { campaign, matchups: publicMatchups, publicUrl: publicCampaignUrl(campaign.code) };
}

export async function getLeaderboard(campaignId: string, maxRows = 200000): Promise<FitWarsLeaderboardRow[]> {
  const [outfits, votes] = await Promise.all([
    supabaseRest<FitWarsOutfit[]>(`fit_wars_outfits?campaign_id=eq.${encodeURIComponent(campaignId)}&is_active=eq.true&permission_status=eq.approved&select=id,display_name,image_url&order=created_at.asc`, { noStore: true }),
    supabaseRestAll<Array<{ choice_outfit_id: string }>>(`fit_wars_votes?campaign_id=eq.${encodeURIComponent(campaignId)}&select=choice_outfit_id&order=created_at.asc`, 1000, maxRows),
  ]);
  const counts = new Map<string, number>();
  for (const vote of votes) counts.set(vote.choice_outfit_id, (counts.get(vote.choice_outfit_id) ?? 0) + 1);
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  return outfits
    .map((outfit) => ({ outfitId: outfit.id, displayName: outfit.display_name, imageUrl: outfit.image_url, votes: counts.get(outfit.id) ?? 0, percentage: total ? Math.round(((counts.get(outfit.id) ?? 0) / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.votes - a.votes || a.displayName.localeCompare(b.displayName));
}

async function countRows(path: string) {
  try {
    return (await supabaseRestPage<{ id: string }>(path, { from: 0, to: 0 }, { noStore: true })).total;
  } catch {
    return 0;
  }
}

export async function getCampaignStats(campaignId: string): Promise<FitWarsStats> {
  const prefix = `campaign_id=eq.${encodeURIComponent(campaignId)}`;
  const [visitors, sessions, votes, completions, emails, optIns, clicks, shares, sessionRows] = await Promise.all([
    countRows(`fit_wars_events?${prefix}&event_type=eq.landing&select=id`),
    countRows(`fit_wars_sessions?${prefix}&select=id`),
    countRows(`fit_wars_votes?${prefix}&select=id`),
    countRows(`fit_wars_events?${prefix}&event_type=eq.session_complete&select=id`),
    countRows(`fit_wars_email_requests?${prefix}&select=id`),
    countRows(`fit_wars_email_requests?${prefix}&marketing_opt_in=is.true&select=id`),
    countRows(`fit_wars_events?${prefix}&event_type=eq.street_click&select=id`),
    countRows(`fit_wars_events?${prefix}&event_type=eq.share&select=id`),
    supabaseRest<Array<{ id: string; visitor_hash: string | null }>>(`fit_wars_sessions?${prefix}&select=id,visitor_hash`, { noStore: true }).catch(() => []),
  ]);
  const uniqueVisitors = new Set(sessionRows.map((row) => row.visitor_hash || row.id)).size;
  return { visitors, uniqueVisitors: uniqueVisitors || sessions, votes, completionRate: uniqueVisitors ? Math.round((completions / uniqueVisitors) * 1000) / 10 : 0, emailRequests: emails, marketingOptIns: optIns, streetClicks: clicks, shares };
}

export async function getCampaignAdminData(id: string): Promise<FitWarsAdminData | null> {
  const campaign = await campaignById(id);
  if (!campaign) return null;
  const [outfits, matchups, leaderboard, stats] = await Promise.all([
    supabaseRest<FitWarsOutfit[]>(`fit_wars_outfits?campaign_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.asc`, { noStore: true }),
    supabaseRest<FitWarsMatchup[]>(`fit_wars_matchups?campaign_id=eq.${encodeURIComponent(id)}&select=*&order=position.asc`, { noStore: true }),
    getLeaderboard(id),
    getCampaignStats(id),
  ]);
  const comments = matchups.length
    ? await supabaseRest<FitWarsCommentary[]>(`fit_wars_commentaries?matchup_id=in.(${matchups.map((matchup) => matchup.id).join(",")})&select=*&order=position.asc`, { noStore: true })
    : [];
  const byId = new Map(outfits.map((outfit) => [outfit.id, outfit]));
  const messagesByMatchup = new Map<string, FitWarsCommentary[]>();
  for (const comment of comments) messagesByMatchup.set(comment.matchup_id, [...(messagesByMatchup.get(comment.matchup_id) ?? []), comment]);
  return {
    campaign,
    outfits,
    matchups: matchups.map((matchup) => ({ ...matchup, left: byId.get(matchup.left_outfit_id) ?? null, right: byId.get(matchup.right_outfit_id) ?? null, messages: messagesByMatchup.get(matchup.id) ?? [] })),
    leaderboard,
    stats,
  };
}

export async function campaignIsReady(campaignId: string) {
  const experience = await getCampaignExperienceById(campaignId);
  return Boolean(experience?.matchups.length);
}

async function getCampaignExperienceById(id: string): Promise<FitWarsExperience | null> {
  const campaign = await campaignById(id);
  if (!campaign) return null;
  return getCampaignExperience(campaign.code, true);
}
