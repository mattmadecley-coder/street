import { NextRequest, NextResponse } from "next/server";
import { payloadMatchesTrackingIdentity, trackingIdentityForRequest } from "@/lib/analytics-request";
import { logSiteEvent } from "@/lib/analytics";

const text = (value: unknown, max = 500) => typeof value === "string" ? value.trim().slice(0, max) || undefined : undefined;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;

function hasImpossibleDeviceSignature(body: Record<string, unknown>) {
  const width = number(body.screenWidth) ?? 0;
  const device = (text(body.deviceType, 40) ?? "").toLowerCase();
  const browser = (text(body.browser, 80) ?? "").toLowerCase();
  const operatingSystem = (text(body.operatingSystem, 80) ?? "").toLowerCase();

  if ((operatingSystem === "ios" || operatingSystem === "android") && width > 1024) return true;
  if (device === "mobile" && width > 900) return true;
  if (browser === "safari" && operatingSystem === "ios" && device === "desktop") return true;
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const identity = trackingIdentityForRequest(request);
    if (!identity) return NextResponse.json({ ok: true, ignored: true }, { status: 202 });

    const body = await request.json() as Record<string, unknown>;
    if (!payloadMatchesTrackingIdentity(identity, body.anonymousUserId, body.sessionId)) {
      return NextResponse.json({ ok: true, ignored: true }, { status: 202 });
    }
    if (hasImpossibleDeviceSignature(body)) {
      return NextResponse.json({ ok: true, ignored: true }, { status: 202 });
    }

    const eventType = text(body.eventType, 80);
    if (!eventType) return NextResponse.json({ ok: false, error: "Missing event type" }, { status: 400 });

    await logSiteEvent({
      eventType,
      eventId: text(body.eventId, 80),
      anonymousUserId: identity.visitorId,
      sessionId: identity.sessionId,
      eventSequence: number(body.eventSequence),
      query: text(body.query, 500),
      resultsCount: number(body.resultsCount),
      productId: text(body.productId, 80),
      brandSlug: text(body.brandSlug, 160),
      streetGroup: text(body.streetGroup, 160),
      streetCategory: text(body.streetCategory, 160),
      price: number(body.price),
      path: text(body.path, 1000),
      referrer: text(body.referrer, 1000) ?? null,
      sourceComponent: text(body.sourceComponent, 160),
      position: number(body.position),
      deviceType: text(body.deviceType, 40),
      browser: text(body.browser, 80),
      operatingSystem: text(body.operatingSystem, 80),
      screenWidth: number(body.screenWidth),
      language: text(body.language, 40),
      timezone: text(body.timezone, 100),
      landingPath: text(body.landingPath, 1000),
      utmSource: text(body.utmSource, 240),
      utmMedium: text(body.utmMedium, 240),
      utmCampaign: text(body.utmCampaign, 240),
      utmContent: text(body.utmContent, 240),
      utmTerm: text(body.utmTerm, 240),
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata as Record<string, unknown> : {},
    });
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    console.error("Street analytics ingestion failed", error);
    return NextResponse.json({ ok: false }, { status: 202 });
  }
}
