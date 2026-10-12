import { supabaseRest } from "@/lib/supabase-rest";
import { clean, clientIp, logContactEvent, normalizePhone, rateLimited } from "@/lib/email-marketing";

export const dynamic = "force-dynamic";

// Step 2 of the popup: attaches a phone number to the contact created in step 1.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  if (rateLimited(`phone:${clientIp(request)}`)) return Response.json({ ok: false, error: "Too many tries. Wait a minute." }, { status: 429 });

  const token = clean(body.token, 60);
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return Response.json({ ok: false, error: "Missing signup. Start again." }, { status: 400 });
  const phone = normalizePhone(body.phone);
  if (!phone) return Response.json({ ok: false, error: "Enter a valid phone number." }, { status: 400 });

  const now = new Date().toISOString();
  try {
    const rows = await supabaseRest<{ id: string }[]>(`email_contacts?token=eq.${token}`, {
      method: "PATCH",
      body: { phone, phone_added_at: now, consent_sms_at: now, updated_at: now },
    });
    if (!rows[0]) return Response.json({ ok: false, error: "Signup not found." }, { status: 404 });
    await logContactEvent(rows[0].id, "phone_added", {});
    return Response.json({ ok: true });
  } catch (error) {
    console.error("email phone failed", error);
    return Response.json({ ok: false, error: "Something went wrong. Try again." }, { status: 500 });
  }
}
