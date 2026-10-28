import { NextResponse } from "next/server";
import { getCampaignByCode } from "@/lib/fit-wars";
import { ensureFitWarsSession, eventUuid, isFitWarsRateLimited, matchupForVote, recordFitWarsEvent, validUuid, voteAlreadyExists } from "@/lib/fit-wars-server";
import { supabaseRest } from "@/lib/supabase-rest";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const campaign = await getCampaignByCode(code, false);
  if (!campaign) return NextResponse.json({ ok: false, error: "Campaign unavailable." }, { status: 404 });
  if (await isFitWarsRateLimited(request, "vote", 40, 60_000)) return NextResponse.json({ ok: false, error: "Too many votes too quickly. Give it a moment." }, { status: 429 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const sessionKey = typeof body.sessionId === "string" ? body.sessionId.trim().slice(0, 120) : "";
    const matchupId = typeof body.matchupId === "string" ? body.matchupId : "";
    const choiceId = typeof body.choiceId === "string" ? body.choiceId : "";
    if (!sessionKey || !validUuid(matchupId) || !validUuid(choiceId)) return NextResponse.json({ ok: false, error: "Missing vote details." }, { status: 400 });
    const matchup = await matchupForVote(campaign.id, matchupId);
    if (!matchup || ![matchup.left_outfit_id, matchup.right_outfit_id].includes(choiceId)) return NextResponse.json({ ok: false, error: "That matchup is no longer available." }, { status: 409 });
    const session = await ensureFitWarsSession({ campaign, sessionKey, request });
    const existing = await voteAlreadyExists(campaign.id, matchupId, sessionKey);
    if (existing) return NextResponse.json({ ok: true, duplicate: true, choiceId: existing.choice_outfit_id });

    await supabaseRest("fit_wars_votes?on_conflict=campaign_id,matchup_id,session_key", {
      method: "POST",
      body: { campaign_id: campaign.id, matchup_id: matchupId, session_id: session.id, session_key: sessionKey, choice_outfit_id: choiceId, event_id: eventUuid(body.eventId) },
      prefer: "resolution=ignore-duplicates,return=minimal",
    });
    await recordFitWarsEvent({ campaign, sessionId: session.id, sessionKey, type: "vote", eventId: eventUuid(body.eventId), matchupId, metadata: { choice: choiceId === matchup.left_outfit_id ? "left" : "right" } }).catch(() => undefined);
    return NextResponse.json({ ok: true, duplicate: false, choiceId });
  } catch (error) {
    console.error("Fit Wars vote failed", error);
    return NextResponse.json({ ok: false, error: "That vote could not be saved. Try again." }, { status: 500 });
  }
}
