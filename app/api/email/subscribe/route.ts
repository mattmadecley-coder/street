import { supabaseRest } from "@/lib/supabase-rest";
import { clean, clientIp, deviceFromUserAgent, logContactEvent, normalizeEmail, rateLimited, type EmailContact } from "@/lib/email-marketing";

export const dynamic = "force-dynamic";

// Step 1 of the popup: the email is saved the moment it's entered.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  // Honeypot: real people never fill this in. Pretend success.
  if (clean(body.website)) return Response.json({ ok: true, token: null });

  const ip = clientIp(request);
  if (rateLimited(`sub:${ip}`)) return Response.json({ ok: false, error: "Too many tries. Wait a minute." }, { status: 429 });

  const email = normalizeEmail(body.email);
  if (!email) return Response.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });

  const anonymousId = clean(body.anonymousId, 80);
  const device = deviceFromUserAgent(request.headers.get("user-agent"));
  const now = new Date().toISOString();

  try {
    const existing = (await supabaseRest<EmailContact[]>(`email_contacts?email=eq.${encodeURIComponent(email)}&select=*&limit=1`, { noStore: true }))[0];
    if (existing) {
      const ids = new Set(existing.anonymous_ids ?? []);
      if (anonymousId) ids.add(anonymousId);
      const resubscribed = existing.status !== "subscribed";
      await supabaseRest(`email_contacts?id=eq.${existing.id}`, {
        method: "PATCH",
        body: { anonymous_ids: [...ids], updated_at: now, ...(resubscribed ? { status: "subscribed", unsubscribed_at: null, consent_email_at: now } : {}) },
        prefer: "return=minimal",
      });
      await logContactEvent(existing.id, resubscribed ? "resubscribed" : "signed_up_again", { path: clean(body.pagePath) });
      return Response.json({ ok: true, token: existing.token, returning: true });
    }

    const created = await supabaseRest<EmailContact[]>("email_contacts", {
      method: "POST",
      body: {
        email,
        status: "subscribed",
        source: clean(body.source, 60) ?? "popup",
        signup_path: clean(body.pagePath, 300),
        device_type: device,
        utm_source: clean(body.utmSource, 120),
        utm_medium: clean(body.utmMedium, 120),
        utm_campaign: clean(body.utmCampaign, 120),
        referrer: clean(body.referrer, 300),
        anonymous_ids: anonymousId ? [anonymousId] : [],
        consent_email_at: now,
        consent_ip: ip === "unknown" ? null : ip,
      },
    });
    const contact = created[0];
    await logContactEvent(contact.id, "signed_up", { source: contact.source, path: contact.signup_path, device });
    return Response.json({ ok: true, token: contact.token });
  } catch (error) {
    console.error("email subscribe failed", error);
    return Response.json({ ok: false, error: "Something went wrong. Try again." }, { status: 500 });
  }
}
