import { supabaseRest } from "@/lib/supabase-rest";
import { clean, clientIp, logContactEvent, rateLimited, type EmailContact, normalizeEmail } from "@/lib/email-marketing";
import { getCampaignByCode, hashVisitor, type FitWarsCampaign, type FitWarsMatchup } from "@/lib/fit-wars";

export function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function eventUuid(value: unknown): string {
  return validUuid(value) ? value : crypto.randomUUID();
}

export async function activeCampaign(code: string) {
  return getCampaignByCode(code, false);
}

export async function ensureFitWarsSession(input: {
  campaign: FitWarsCampaign;
  sessionKey: string;
  request: Request;
  referrer?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
  utmContent?: unknown;
}) {
  const sessionKey = clean(input.sessionKey, 120);
  if (!sessionKey) throw new Error("Missing session.");
  const now = new Date().toISOString();
  const encodedCampaign = encodeURIComponent(input.campaign.id);
  const encodedSession = encodeURIComponent(sessionKey);
  const existing = await supabaseRest<Array<{ id: string }>>(`fit_wars_sessions?campaign_id=eq.${encodedCampaign}&session_key=eq.${encodedSession}&select=id&limit=1`, { noStore: true });
  const values = {
    last_seen_at: now,
    visitor_hash: hashVisitor(`${clientIp(input.request)}|${input.request.headers.get("user-agent") ?? ""}`),
    referrer: clean(input.referrer, 1000) ?? null,
    utm_source: clean(input.utmSource, 240) ?? null,
    utm_medium: clean(input.utmMedium, 240) ?? null,
    utm_campaign: clean(input.utmCampaign, 240) ?? null,
    utm_content: clean(input.utmContent, 240) ?? null,
  };
  if (existing[0]) {
    await supabaseRest(`fit_wars_sessions?id=eq.${existing[0].id}`, { method: "PATCH", body: values, prefer: "return=minimal" });
    return { id: existing[0].id, sessionKey };
  }
  const created = await supabaseRest<Array<{ id: string }>>("fit_wars_sessions", {
    method: "POST",
    body: { campaign_id: input.campaign.id, session_key: sessionKey, first_seen_at: now, ...values },
  });
  return { id: created[0]?.id ?? null, sessionKey };
}

export async function recordFitWarsEvent(input: {
  campaign: FitWarsCampaign;
  sessionId?: string | null;
  sessionKey?: string | null;
  type: "landing" | "matchup_view" | "vote" | "commentary_view" | "email_form_view" | "email_request" | "marketing_opt_in" | "street_click" | "share" | "session_complete" | "error";
  eventId: string;
  matchupId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await supabaseRest("fit_wars_events?on_conflict=event_id", {
    method: "POST",
    body: {
      campaign_id: input.campaign.id,
      session_id: input.sessionId ?? null,
      session_key: input.sessionKey ?? null,
      event_type: input.type,
      matchup_id: input.matchupId ?? null,
      event_id: eventUuid(input.eventId),
      metadata: input.metadata ?? {},
    },
    prefer: "resolution=ignore-duplicates,return=minimal",
  });
}

export async function matchupForVote(campaignId: string, matchupId: string): Promise<FitWarsMatchup | null> {
  if (!validUuid(matchupId)) return null;
  const rows = await supabaseRest<FitWarsMatchup[]>(`fit_wars_matchups?id=eq.${encodeURIComponent(matchupId)}&campaign_id=eq.${encodeURIComponent(campaignId)}&is_active=eq.true&select=*&limit=1`, { noStore: true });
  return rows[0] ?? null;
}

export async function voteAlreadyExists(campaignId: string, matchupId: string, sessionKey: string) {
  const rows = await supabaseRest<Array<{ choice_outfit_id: string }>>(`fit_wars_votes?campaign_id=eq.${encodeURIComponent(campaignId)}&matchup_id=eq.${encodeURIComponent(matchupId)}&session_key=eq.${encodeURIComponent(sessionKey)}&select=choice_outfit_id&limit=1`, { noStore: true });
  return rows[0] ?? null;
}

export async function isFitWarsRateLimited(request: Request, scope: string, limit = 30, windowMs = 60_000) {
  return rateLimited(`fit-wars:${scope}:${clientIp(request)}`, limit, windowMs);
}

export async function subscribeFitWarsMarketing(email: string, code: string, request: Request) {
  const now = new Date().toISOString();
  const existing = (await supabaseRest<Array<EmailContact & { consent_email_at?: string | null }>>(`email_contacts?email=eq.${encodeURIComponent(email)}&select=*&limit=1`, { noStore: true }))[0];
  const tag = `fit_wars:${code}`;
  if (existing) {
    const tags = new Set(existing.tags ?? []);
    tags.add(tag);
    await supabaseRest(`email_contacts?id=eq.${existing.id}`, {
      method: "PATCH",
      body: { tags: [...tags], status: "subscribed", unsubscribed_at: null, consent_email_at: existing.consent_email_at ?? now, consent_ip: clientIp(request) === "unknown" ? null : clientIp(request), updated_at: now },
      prefer: "return=minimal",
    });
    await logContactEvent(existing.id, "fit_wars_opted_in", { code });
    return existing.id;
  }
  const created = await supabaseRest<EmailContact[]>("email_contacts", {
    method: "POST",
    body: {
      email,
      status: "subscribed",
      source: "fit_wars",
      signup_path: `/f/${code}`,
      tags: [tag],
      consent_email_at: now,
      consent_ip: clientIp(request) === "unknown" ? null : clientIp(request),
    },
  });
  if (created[0]) await logContactEvent(created[0].id, "fit_wars_opted_in", { code });
  return created[0]?.id ?? null;
}

export function parseEmail(value: unknown) {
  return normalizeEmail(value);
}
