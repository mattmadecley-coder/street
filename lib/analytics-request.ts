import type { NextRequest } from "next/server";

export type TrackingIdentity = { visitorId: string; sessionId: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUTOMATED_USER_AGENT = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|twitterbot|linkedinbot|discordbot|telegrambot|whatsapp|headless|lighthouse|pagespeed|google-inspectiontool|prerender|preview|uptimerobot|statuscake|synthetic|monitoring|curl|wget|python-requests|node-fetch/i;

function isNonProductionHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
}

/**
 * Engagement is recorded only after Street's browser tracker has established a
 * first-party visitor and session. Crawlers can still follow /api/out and reach
 * the brand, but their requests never become analytics rows.
 */
export function trackingIdentityForRequest(request: NextRequest): TrackingIdentity | null {
  if (isNonProductionHost(request.nextUrl.hostname)) return null;
  if (request.cookies.get("street_analytics_excluded")?.value === "true") return null;
  if (request.headers.get("x-street-analytics-test") === "1") return null;

  const userAgent = request.headers.get("user-agent")?.trim() ?? "";
  if (!userAgent || AUTOMATED_USER_AGENT.test(userAgent)) return null;

  const purpose = `${request.headers.get("purpose") ?? ""} ${request.headers.get("sec-purpose") ?? ""}`;
  if (/prefetch|prerender/i.test(purpose)) return null;

  const visitorId = request.cookies.get("street_visitor_id")?.value ?? "";
  const sessionId = request.cookies.get("street_session_id")?.value ?? "";
  if (!UUID_PATTERN.test(visitorId) || !UUID_PATTERN.test(sessionId)) return null;

  return { visitorId, sessionId };
}

export function payloadMatchesTrackingIdentity(
  identity: TrackingIdentity,
  anonymousUserId: unknown,
  sessionId: unknown,
) {
  return anonymousUserId === identity.visitorId && sessionId === identity.sessionId;
}
