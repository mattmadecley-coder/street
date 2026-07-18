import { NextRequest, NextResponse } from "next/server";
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

  let attribution: { utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null } = {};
  try {
    attribution = JSON.parse(decodeURIComponent(request.cookies.get("street_attribution")?.value ?? "{}"));
  } catch {}

  const referrer = request.headers.get("referer");
  await logOutboundClick({
    brandSlug: brand,
    productSlug: product,
    destinationUrl: destination.toString(),
    anonymousUserId: request.cookies.get("street_visitor_id")?.value ?? null,
    sessionId: request.cookies.get("street_session_id")?.value ?? null,
    sourceComponent,
    sourcePath: referrerPath(referrer),
    searchQuery,
    position,
    referrer,
    utmSource: attribution.utmSource ?? null,
    utmMedium: attribution.utmMedium ?? null,
    utmCampaign: attribution.utmCampaign ?? null,
  });
  return NextResponse.redirect(destination, 307);
}
