import { fromAddress, loadEmailSettings } from "@/lib/email-settings";
import { siteUrl } from "@/lib/email-products";
import type { FitWarsLeaderboardRow } from "@/lib/fit-wars";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function sendFitWarsResultsEmail(input: {
  to: string;
  campaignName: string;
  code: string;
  leaderboard: FitWarsLeaderboardRow[];
  requestId: string;
}): Promise<{ ok: true; resendId: string | null } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "Email sending is not configured yet." };

  const { settings } = await loadEmailSettings();
  const url = `${siteUrl()}/f/${encodeURIComponent(input.code)}`;
  const rows = input.leaderboard.slice(0, 5);
  const htmlRows = rows.length
    ? rows.map((row, index) => `<tr><td style="padding:10px 8px;font-weight:700">${index + 1}</td><td style="padding:10px 8px"><img src="${escapeHtml(row.imageUrl)}" alt="" width="54" height="68" style="object-fit:cover;vertical-align:middle;margin-right:10px;border-radius:3px" />${escapeHtml(row.displayName)}</td><td style="padding:10px 8px;text-align:right;font-weight:700">${row.votes} vote${row.votes === 1 ? "" : "s"} · ${row.percentage}%</td></tr>`).join("")
    : `<tr><td colspan="3" style="padding:12px 8px">The leaderboard is still warming up. Check back soon.</td></tr>`;
  const textRows = rows.length ? rows.map((row, index) => `${index + 1}. ${row.displayName} — ${row.votes} votes (${row.percentage}%)`).join("\n") : "The leaderboard is still warming up.";
  const subject = `${input.campaignName} Fit Wars leaderboard`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f3ee;color:#101010;font-family:Arial,Helvetica,sans-serif"><div style="max-width:620px;margin:0 auto;padding:32px 20px"><p style="font-size:15px;font-weight:900;letter-spacing:-.08em;margin:0 0 36px">STREET</p><p style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.6">${escapeHtml(input.campaignName)}</p><h1 style="font-size:40px;line-height:.92;letter-spacing:-.08em;margin:10px 0 24px">THE FIT WARS LEADERBOARD</h1><table style="width:100%;border-collapse:collapse;background:#fff;border-top:1px solid #101010;border-bottom:1px solid #101010"><tbody>${htmlRows}</tbody></table><p style="margin:28px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 16px;background:#101010;color:#fff;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Vote again</a></p><p style="font-size:13px;line-height:1.55;color:#555">Want a wardrobe upgrade? <a href="${escapeHtml(siteUrl())}" style="color:#101010;font-weight:700">Explore Street</a>.</p><p style="font-size:11px;color:#777;line-height:1.5">You asked Street to send the current results for this Fit Wars campaign. This email is not a marketing subscription.</p></div></body></html>`;
  const text = `STREET\n\n${input.campaignName}\nTHE FIT WARS LEADERBOARD\n\n${textRows}\n\nVote again: ${url}\nExplore Street: ${siteUrl()}`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `fit-wars-${input.requestId}`,
      },
      body: JSON.stringify({
        from: fromAddress(settings),
        to: [input.to],
        subject,
        html,
        text,
        reply_to: settings.replyTo,
        tags: [{ name: "campaign", value: "fit-wars" }, { name: "campaign_code", value: input.code }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) return { ok: false, error: String(body.message ?? `Email service returned ${response.status}`).slice(0, 300) };
    return { ok: true, resendId: body.id ?? null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 300) : "Email service unavailable." };
  }
}
