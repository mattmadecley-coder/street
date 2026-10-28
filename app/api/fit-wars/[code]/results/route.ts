import { NextResponse } from "next/server";
import { getCampaignByCode, getLeaderboard } from "@/lib/fit-wars";
import { sendFitWarsResultsEmail } from "@/lib/fit-wars-email";
import { ensureFitWarsSession, eventUuid, isFitWarsRateLimited, parseEmail, recordFitWarsEvent, subscribeFitWarsMarketing } from "@/lib/fit-wars-server";
import { clientIp } from "@/lib/email-marketing";
import { supabaseRest } from "@/lib/supabase-rest";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const campaign = await getCampaignByCode(code, false);
  if (!campaign) return NextResponse.json({ ok: false, error: "Campaign unavailable." }, { status: 404 });
  if (await isFitWarsRateLimited(request, "results", 5, 10 * 60_000)) return NextResponse.json({ ok: false, error: "Too many requests. Try again in a few minutes." }, { status: 429 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const email = parseEmail(body.email);
    const sessionKey = typeof body.sessionId === "string" ? body.sessionId.trim().slice(0, 120) : "";
    const marketingOptIn = body.marketingOptIn === true;
    if (!email) return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
    if (!sessionKey) return NextResponse.json({ ok: false, error: "Missing session." }, { status: 400 });
    const session = await ensureFitWarsSession({ campaign, sessionKey, request });
    const leaderboard = await getLeaderboard(campaign.id);
    const requestEventId = eventUuid(body.eventId);
    const created = await supabaseRest<Array<{ id: string }>>("fit_wars_email_requests", {
      method: "POST",
      body: { campaign_id: campaign.id, session_id: session.id, email, marketing_opt_in: marketingOptIn, leaderboard_snapshot: leaderboard.slice(0, 5), consent_ip: clientIp(request) === "unknown" ? null : clientIp(request) },
    });
    const requestId = created[0]?.id;
    if (!requestId) return NextResponse.json({ ok: false, error: "We could not save that request." }, { status: 500 });

    const result = await sendFitWarsResultsEmail({ to: email, campaignName: campaign.school_name, code: campaign.code, leaderboard, requestId });
    if (!result.ok) {
      await supabaseRest(`fit_wars_email_requests?id=eq.${requestId}`, { method: "PATCH", body: { status: "failed", error: result.error }, prefer: "return=minimal" }).catch(() => undefined);
      return NextResponse.json({ ok: false, error: "We saved your request, but the email could not be sent yet." }, { status: 503 });
    }
    const now = new Date().toISOString();
    await supabaseRest(`fit_wars_email_requests?id=eq.${requestId}`, { method: "PATCH", body: { status: "sent", resend_id: result.resendId, sent_at: now, error: null }, prefer: "return=minimal" });
    if (marketingOptIn) await subscribeFitWarsMarketing(email, campaign.code, request);
    await recordFitWarsEvent({ campaign, sessionId: session.id, sessionKey, type: "email_request", eventId: requestEventId, metadata: { marketingOptIn } }).catch(() => undefined);
    if (marketingOptIn) await recordFitWarsEvent({ campaign, sessionId: session.id, sessionKey, type: "marketing_opt_in", eventId: eventUuid(null), metadata: { emailRequestId: requestId } }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Fit Wars results email failed", error);
    return NextResponse.json({ ok: false, error: "Something went wrong. Try again." }, { status: 500 });
  }
}
