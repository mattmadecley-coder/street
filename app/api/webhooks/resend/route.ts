import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseRest } from "@/lib/supabase-rest";

// Resend -> Street webhook: records delivered / opened / clicked / bounced /
// complained events on brand_report_emails so /admin/reports can show them.
// Signed with Svix (id.timestamp.body, HMAC-SHA256, secret "whsec_<base64>").

export const dynamic = "force-dynamic";

function verify(body: string, headers: Headers, secret: string) {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!id || !timestamp || !signatures) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 5 * 60) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signatures.split(" ").some((part) => {
    const [, value] = part.split(",");
    if (!value) return false;
    const candidate = Buffer.from(value, "base64");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}

type ResendEvent = { type?: string; created_at?: string; data?: { email_id?: string; to?: string[]; subject?: string; click?: { link?: string } } };
type ContactRow = { id: string; emails_sent: number; open_count: number; click_count: number; first_opened_at: string | null };

// Emails that aren't brand reports go to Street's own customers: track the same
// events on email_contacts and keep a per-contact timeline for the admin profile.
async function handleCustomerEvent(event: ResendEvent, type: string) {
  const to = event.data?.to?.[0]?.trim().toLowerCase();
  if (!to) return Response.json({ ok: true, ignored: "no recipient" });
  const contact = (await supabaseRest<ContactRow[]>(`email_contacts?email=eq.${encodeURIComponent(to)}&select=id,emails_sent,open_count,click_count,first_opened_at&limit=1`, { noStore: true }))[0];
  if (!contact) return Response.json({ ok: true, ignored: "not a brand report or customer" });

  const at = event.created_at ?? new Date().toISOString();
  const kind = type.replace("email.", "");
  const patch: Record<string, unknown> = { updated_at: at };
  if (type === "email.sent") patch.emails_sent = (contact.emails_sent ?? 0) + 1;
  if (type === "email.opened") {
    patch.open_count = (contact.open_count ?? 0) + 1;
    patch.last_opened_at = at;
    if (!contact.first_opened_at) patch.first_opened_at = at;
  }
  if (type === "email.clicked") {
    patch.click_count = (contact.click_count ?? 0) + 1;
    patch.last_clicked_at = at;
  }
  if (type === "email.bounced") patch.status = "bounced";
  if (type === "email.complained") {
    patch.status = "complained";
    patch.unsubscribed_at = at;
  }
  await supabaseRest(`email_contacts?id=eq.${contact.id}`, { method: "PATCH", body: patch, prefer: "return=minimal" });
  await supabaseRest("email_contact_events", {
    method: "POST",
    body: { contact_id: contact.id, type: kind, created_at: at, meta: { subject: event.data?.subject ?? null, url: event.data?.click?.link ?? null, resend_id: event.data?.email_id ?? null } },
    prefer: "return=minimal",
  });
  return Response.json({ ok: true, customer: true });
}
type EmailRow = { id: string; brand_id: string; open_count: number; first_opened_at: string | null; first_clicked_at: string | null };

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 503 });
  const body = await request.text();
  if (!verify(body, request.headers, secret)) return new Response("Invalid signature", { status: 401 });

  let event: ResendEvent;
  try {
    event = JSON.parse(body) as ResendEvent;
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const resendId = event.data?.email_id;
  const type = event.type ?? "";
  if (!resendId || !type.startsWith("email.")) return Response.json({ ok: true, ignored: true });

  const rows = await supabaseRest<EmailRow[]>(`brand_report_emails?resend_id=eq.${encodeURIComponent(resendId)}&select=id,brand_id,open_count,first_opened_at,first_clicked_at&limit=1`, { noStore: true });
  const row = rows[0];
  if (!row) return handleCustomerEvent(event, type);

  const at = event.created_at ?? new Date().toISOString();
  const patch: Record<string, unknown> = { last_event: type.replace("email.", ""), last_event_at: at };
  if (type === "email.delivered") patch.delivered_at = at;
  if (type === "email.opened") {
    patch.open_count = (row.open_count ?? 0) + 1;
    patch.last_opened_at = at;
    if (!row.first_opened_at) patch.first_opened_at = at;
  }
  if (type === "email.clicked" && !row.first_clicked_at) patch.first_clicked_at = at;
  if (type === "email.bounced") patch.bounced_at = at;
  if (type === "email.complained") {
    patch.complained_at = at;
    // A spam complaint is an opt-out: stop emailing this brand.
    await supabaseRest(`brand_contacts?brand_id=eq.${row.brand_id}`, { method: "PATCH", body: { reports_opted_out_at: at }, prefer: "return=minimal" }).catch(() => undefined);
  }
  await supabaseRest(`brand_report_emails?id=eq.${row.id}`, { method: "PATCH", body: patch, prefer: "return=minimal" });
  return Response.json({ ok: true });
}
