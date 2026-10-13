import { NextRequest, NextResponse } from "next/server";
import { loadAlertView } from "@/lib/admin-alerts";
import { readAdminState, writeAdminState } from "@/lib/admin-state";
import { formatDigest, newAlertsSince, nextMemory, type DigestMemory } from "@/lib/alert-digest";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Daily alert digest. Does nothing unless a destination is configured:
 *   ALERT_SLACK_WEBHOOK_URL            Slack incoming webhook
 *   RESEND_API_KEY + ALERT_EMAIL_FROM + ALERT_EMAIL_TO   email through Resend
 * Only alerts that are new (or got more severe) since the last digest are sent.
 * Unlike the older cron routes this one refuses to run when CRON_SECRET is unset.
 */
function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

async function sendSlack(webhookUrl: string, text: string) {
  const response = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  if (!response.ok) throw new Error(`Slack returned ${response.status}`);
}

async function sendEmail(apiKey: string, from: string, to: string, subject: string, text: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: to.split(",").map((address) => address.trim()).filter(Boolean), subject, text }),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}`);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const slackUrl = process.env.ALERT_SLACK_WEBHOOK_URL?.trim();
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const emailFrom = process.env.ALERT_EMAIL_FROM?.trim();
  const emailTo = process.env.ALERT_EMAIL_TO?.trim();
  const emailReady = Boolean(resendKey && emailFrom && emailTo);
  if (!slackUrl && !emailReady) return NextResponse.json({ ok: true, configured: false, sent: 0 });

  const view = await loadAlertView();
  const memoryState = await readAdminState<DigestMemory>("alert_digest", {});
  if (!memoryState.available) return NextResponse.json({ ok: true, configured: true, sent: 0, note: "admin_state migration not applied; refusing to send without a way to avoid repeats." });

  const fresh = newAlertsSince(view.active, memoryState.value);
  if (!fresh.length) {
    await writeAdminState("alert_digest", nextMemory(view.active));
    return NextResponse.json({ ok: true, configured: true, sent: 0, open: view.active.length });
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://streetdotcom.com").replace(/\/$/, "");
  const digest = formatDigest(fresh, view.active.length, siteUrl);
  const errors: string[] = [];
  if (slackUrl) await sendSlack(slackUrl, digest.slackText).catch((error) => errors.push(`slack: ${error.message}`));
  if (emailReady) await sendEmail(resendKey as string, emailFrom as string, emailTo as string, digest.subject, digest.text).catch((error) => errors.push(`email: ${error.message}`));

  // Remember what was reported only if at least one channel succeeded, so a failed send retries tomorrow.
  const attempted = (slackUrl ? 1 : 0) + (emailReady ? 1 : 0);
  if (errors.length < attempted) await writeAdminState("alert_digest", nextMemory(view.active));
  return NextResponse.json({ ok: errors.length < attempted, configured: true, sent: fresh.length, errors });
}
