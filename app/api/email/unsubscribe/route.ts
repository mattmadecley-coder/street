import { supabaseRest } from "@/lib/supabase-rest";
import { logContactEvent } from "@/lib/email-marketing";

export const dynamic = "force-dynamic";

async function unsubscribe(token: string | null) {
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return false;
  const now = new Date().toISOString();
  const rows = await supabaseRest<{ id: string }[]>(`email_contacts?token=eq.${token}`, {
    method: "PATCH",
    body: { status: "unsubscribed", unsubscribed_at: now, updated_at: now },
  }).catch(() => []);
  if (!rows[0]) return false;
  await logContactEvent(rows[0].id, "unsubscribed", {});
  return true;
}

function page(message: string) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title><body style="font-family:system-ui,sans-serif;background:#f4f3ee;color:#101010;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:420px;padding:24px"><h1 style="font-size:28px;margin:0 0 8px">Street</h1><p style="font-size:16px;line-height:1.5">${message}</p></main></body>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(request: Request) {
  const ok = await unsubscribe(new URL(request.url).searchParams.get("t"));
  return page(ok ? "You're unsubscribed. You won't get any more emails from us." : "That unsubscribe link isn't valid.");
}

// One-click unsubscribe (RFC 8058) posts here.
export async function POST(request: Request) {
  const ok = await unsubscribe(new URL(request.url).searchParams.get("t"));
  return Response.json({ ok });
}
