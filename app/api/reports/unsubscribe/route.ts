import { NextRequest, NextResponse } from "next/server";
import { supabaseRest } from "@/lib/supabase-rest";

// Unsubscribe link in every brand report email. GET (a person clicking the
// link) and POST (Gmail/Apple one-click "List-Unsubscribe-Post") both opt the
// brand out immediately — no login, no confirmation step.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function optOut(token: string | null) {
  if (!token || !UUID_RE.test(token)) return false;
  const rows = await supabaseRest<Array<{ brand_id: string }>>(`brand_contacts?report_token=eq.${token}`, {
    method: "PATCH",
    body: { reports_opted_out_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    prefer: "return=representation",
  });
  return rows.length > 0;
}

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · Street</title></head>
<body style="margin:0;background:#f4f3ee;color:#101010;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:48px 20px;">
<a href="/" style="font-size:22px;font-weight:700;letter-spacing:-1.5px;color:#101010;text-decoration:none;">STREET</a>
<h1 style="font-size:28px;letter-spacing:-1px;margin:32px 0 12px;">${title}</h1>
<p style="font-size:15px;line-height:23px;color:#2b2a27;">${body}</p>
</div></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const ok = await optOut(request.nextUrl.searchParams.get("token")).catch(() => false);
  return ok
    ? page("You're unsubscribed", "You won't get any more daily reports from Street. Your listing stays as it is — if you'd like it changed or removed, just email hello@streetdotcom.com.")
    : page("Link not recognized", "We couldn't match this unsubscribe link. Email hello@streetdotcom.com and we'll take you off the list right away.", 400);
}

export async function POST(request: NextRequest) {
  const ok = await optOut(request.nextUrl.searchParams.get("token")).catch(() => false);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
