import { supabaseRest } from "@/lib/supabase-rest";
import { clean, clientIp, deviceFromUserAgent, rateLimited } from "@/lib/email-marketing";

export const dynamic = "force-dynamic";

const TYPES = new Set([
  "shown", "closed", "closed_email_step", "closed_phone_step", "email_started", "email_submitted",
  "phone_started", "phone_submitted", "skipped_phone", "email_error", "phone_error",
]);

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const type = clean(body.type, 40);
  if (!type || !TYPES.has(type) || rateLimited(`pev:${clientIp(request)}`, 30)) return Response.json({ ok: false }, { status: 400 });
  await supabaseRest("email_popup_events", {
    method: "POST",
    body: { type, anonymous_id: clean(body.anonymousId, 80), path: clean(body.pagePath, 300), device_type: deviceFromUserAgent(request.headers.get("user-agent")) },
    prefer: "return=minimal",
  }).catch(() => undefined);
  return Response.json({ ok: true });
}
