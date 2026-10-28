import { NextResponse } from "next/server";
import { getCampaignByCode } from "@/lib/fit-wars";
import { ensureFitWarsSession, eventUuid, isFitWarsRateLimited, recordFitWarsEvent } from "@/lib/fit-wars-server";

export const dynamic = "force-dynamic";

const EVENTS = new Set(["landing", "matchup_view", "commentary_view", "email_form_view", "street_click", "share", "session_complete", "error"] as const);

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const campaign = await getCampaignByCode(code, false);
  if (!campaign) return NextResponse.json({ ok: false, error: "Campaign unavailable." }, { status: 404 });
  if (await isFitWarsRateLimited(request, "event", 80, 60_000)) return NextResponse.json({ ok: true }, { status: 202 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const type = typeof body.type === "string" && EVENTS.has(body.type as never) ? body.type as Parameters<typeof recordFitWarsEvent>[0]["type"] : null;
    const sessionKey = typeof body.sessionId === "string" ? body.sessionId.trim().slice(0, 120) : "";
    if (!type || !sessionKey) return NextResponse.json({ ok: false, error: "Missing event details." }, { status: 400 });
    const session = await ensureFitWarsSession({ campaign, sessionKey, request, referrer: body.referrer, utmSource: body.utmSource, utmMedium: body.utmMedium, utmCampaign: body.utmCampaign, utmContent: body.utmContent });
    await recordFitWarsEvent({ campaign, sessionId: session.id, sessionKey, type, eventId: eventUuid(body.eventId), matchupId: typeof body.matchupId === "string" ? body.matchupId : null, metadata: body.metadata && typeof body.metadata === "object" ? body.metadata as Record<string, unknown> : {} });
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    console.error("Fit Wars event failed", error);
    return NextResponse.json({ ok: true }, { status: 202 });
  }
}
