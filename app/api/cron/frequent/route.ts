import { NextRequest, NextResponse } from "next/server";
import { hasCronSecretAccess } from "@/lib/cron-auth";
import { runEmailQueue } from "@/lib/email-send";
import { runBotGuard } from "@/lib/bot-guard";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Runs every ten minutes: spots crawler bursts that would inflate visitor counts, then starts scheduled
 * email campaigns and keeps sends moving. Each part is independent, so one failing never blocks the other.
 */
export async function GET(request: NextRequest) {
  if (!hasCronSecretAccess(request.headers.get("authorization"))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const out: Record<string, unknown> = {};
  let ok = true;
  try {
    const guard = await runBotGuard();
    out.botGuard = { available: guard.available, rulesCreated: guard.created.length, bursts: guard.created };
  } catch (error) {
    ok = false;
    out.botGuard = { error: error instanceof Error ? error.message : String(error) };
    console.error("bot guard failed", error);
  }
  try {
    out.email = await runEmailQueue(Date.now(), 40_000);
  } catch (error) {
    ok = false;
    out.email = { error: error instanceof Error ? error.message : String(error) };
    console.error("email queue failed", error);
  }
  return NextResponse.json({ ok, ...out }, { status: ok ? 200 : 502 });
}
