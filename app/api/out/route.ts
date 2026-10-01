import { NextRequest, NextResponse } from "next/server";
import { trackingIdentityForRequest } from "@/lib/analytics-request";
import { logOutboundClick, resolveOutboundDestination } from "@/lib/outbound-clicks";

function referrerPath(referrer: string | null) {
  if (!referrer) return null;
  try { return new URL(referrer).pathname; } catch { return null; }
}

export async function GET(request: NextRequest) {
  const to = request.nextUrl.searchParams.get("to");
  const brand = request.nextUrl.searchParams.get("brand");
  const product = request.nextUrl.searchParams.get("product") ?? undefined;
  const sourceComponent = request.nextUrl.searchParams.get("source");
  const searchQuery = request.nextUrl.searchParams.get("q");
  const positionRaw = request.nextUrl.searchParams.get("position");
  const position = positionRaw && Number.isFinite(Number(positionRaw)) ? Number(positionRaw) : null;

  const destination = await resolveOutboundDestination(brand, to);
  if (!destination || !brand) {
    return NextResponse.json({ ok: false, error: "Unrecognized or disallowed destination." }, { status: 400 });
  }

  // Crawlers and link scanners should still reach the brand destination, but
  // only a browser session established by Street's first-party tracker counts
  // as purchase intent.
  const identity = trackingIdentityForRequest(request);
  if (identity) {
    let attribution: { utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null } = {};
    try {
      attribution = JSON.parse(decodeURIComponent(request.cookies.get("street_attribution")?.value ?? "{}"));
    } catch {}

    const referrer = request.headers.get("referer");
    await logOutboundClick({
      brandSlug: brand,
      productSlug: product,
      destinationUrl: destination.toString(),
      anonymousUserId: identity.visitorId,
      sessionId: identity.sessionId,
      sourceComponent,
      sourcePath: referrerPath(referrer),
      searchQuery,
      position,
      referrer,
      utmSource: attribution.utmSource ?? null,
      utmMedium: attribution.utmMedium ?? null,
      utmCampaign: attribution.utmCampaign ?? null,
    });
  }

  // Street sends brands real shoppers, but without its own attribution on
  // the outgoing link, that traffic is invisible in the brand's own store
  // analytics (Shopify/Squarespace/GA) -- indistinguishable from direct
  // traffic. The 2026-10-01 Codex review flagged inconsistent/missing
  // campaign-link labeling; this is the one outbound path every "Buy Now" /
  // "Shop at <brand>" link funnels through, so tagging it here covers all of
  // them consistently. Only set when absent, so a destination URL that
  // already carries its own utm_* (unlikely, but possible via a brand's own
  // marketing link) is never overwritten.
  const campaign = (sourceComponent ?? "product_discovery").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40) || "product_discovery";
  if (!destination.searchParams.has("utm_source")) destination.searchParams.set("utm_source", "streetdotcom");
  if (!destination.searchParams.has("utm_medium")) destination.searchParams.set("utm_medium", "referral");
  if (!destination.searchParams.has("utm_campaign")) destination.searchParams.set("utm_campaign", campaign);

  return NextResponse.redirect(destination, 307);
}
