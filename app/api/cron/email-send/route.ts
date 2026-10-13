import { NextRequest, NextResponse } from "next/server";
import { hasCronSecretAccess } from "@/lib/cron-auth";
import { runEmailQueue } from "@/lib/email-send";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Starts scheduled campaigns whose time has come and keeps sending campaigns moving (including the
 * next day's share when the daily cap paused one). Safe to call as often as you like: it only does
 * work that is due, and every recipient is sent to at most once per campaign.
 */
export async function GET(request: NextRequest) {
  if (!hasCronSecretAccess(request.headers.get("authorization"))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const run = await runEmailQueue(Date.now(), 45_000);
    return NextResponse.json({ ok: true, ...run });
  } catch (error) {
    console.error("email queue failed", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Queue failed" }, { status: 500 });
  }
}
