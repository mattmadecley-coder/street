import { createHash } from "node:crypto";
import { hasSupabaseCatalog, supabaseRest, supabaseRestAll, supabaseRestPage } from "@/lib/supabase-rest";
import { renderEmail, type EmailTemplateData } from "@/lib/email-blocks";
import { resolveProducts, siteUrl } from "@/lib/email-products";
import { evaluateSegment, type SegmentContactRow, type SegmentDefinition } from "@/lib/email-segments-core";
import { fromAddress, loadEmailSettings, type EmailSettings } from "@/lib/email-settings";
import { cleanTemplate } from "@/lib/email-blocks";
import { cleanDefinition } from "@/lib/email-segments-core";
import { getCampaign, type CampaignRow } from "@/lib/email-campaigns";

/**
 * The sending engine for customer email. Everything that decides WHO gets an email lives here, so the
 * rules are in one place: only subscribed people, never twice per campaign, never above the daily cap,
 * and unsubscribed/bounced people are re-checked right before sending.
 */
export const BATCH_SIZE = 100;
const MAX_ATTEMPTS = 3;
const DAY_MS = 86_400_000;

export type SendConfig = { apiKey: string; mailingAddress: string };

export function sendConfig(): SendConfig {
  return { apiKey: (process.env.RESEND_API_KEY ?? "").trim(), mailingAddress: (process.env.BRAND_REPORTS_MAILING_ADDRESS ?? "").trim() };
}

/** Plain-language reasons sending is blocked, empty when ready. */
export function sendingProblems(config: SendConfig): string[] {
  const problems: string[] = [];
  if (!config.apiKey) problems.push("RESEND_API_KEY is not set, so nothing can be sent.");
  if (!config.mailingAddress) problems.push("BRAND_REPORTS_MAILING_ADDRESS is not set. A mailing address is required in every marketing email (CAN-SPAM), so sending is blocked.");
  return problems;
}

export const unsubscribeUrl = (token: string, campaignId?: string) => `${siteUrl()}/api/email/unsubscribe?t=${token}${campaignId ? `&c=${campaignId}` : ""}`;

type ContactForSend = SegmentContactRow & { token: string };

export type ResendMessage = {
  from: string; to: string[]; subject: string; html: string; text: string; reply_to: string;
  headers: Record<string, string>; tags: Array<{ name: string; value: string }>;
};

export function buildMessage(content: EmailTemplateData, subject: string, preheader: string, contact: { email: string; token: string }, campaignId: string, settings: EmailSettings, mailingAddress: string, products: Parameters<typeof renderEmail>[1]["products"]): ResendMessage {
  const unsubscribe = unsubscribeUrl(contact.token, campaignId);
  const template: EmailTemplateData = { ...content, subject: subject || content.subject, preheader: preheader || content.preheader };
  const rendered = renderEmail(template, { siteUrl: siteUrl(), unsubscribeUrl: unsubscribe, products, mailingAddress });
  return {
    from: fromAddress(settings), to: [contact.email], subject: rendered.subject, html: rendered.html, text: rendered.text, reply_to: settings.replyTo,
    headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    tags: [{ name: "campaign_id", value: campaignId }],
  };
}

async function resendRequest(path: string, apiKey: string, body: unknown, idempotencyKey?: string): Promise<{ ok: boolean; status: number; json: any }> {
  const response = await fetch(`https://api.resend.com${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, json };
}

/** One test message to one address, clearly marked. Never touches the audience. */
export async function sendTestEmail(input: { content: EmailTemplateData; subject: string; preheader: string; to: string; campaignId: string }): Promise<{ ok: boolean; error?: string }> {
  const config = sendConfig();
  const problems = sendingProblems(config);
  if (problems.length) return { ok: false, error: problems[0] };
  const { settings } = await loadEmailSettings();
  const products = await resolveProducts(input.content.blocks);
  const message = buildMessage(input.content, `[TEST] ${input.subject || input.content.subject}`, input.preheader, { email: input.to, token: "00000000-0000-4000-8000-000000000000" }, input.campaignId, settings, config.mailingAddress, products);
  const result = await resendRequest("/emails", config.apiKey, message);
  return result.ok ? { ok: true } : { ok: false, error: String(result.json?.message ?? `Resend returned ${result.status}`).slice(0, 300) };
}

const CONTACT_COLUMNS = "id,email,token,status,phone,tags,created_at,emails_sent,open_count,click_count,last_opened_at,last_clicked_at,source,utm_source,utm_medium,utm_campaign,device_type,signup_path";

/** Everyone who would receive a campaign to this segment: matching AND currently subscribed. */
export async function audienceFor(definition: SegmentDefinition, nowMs: number = Date.now(), maxRows = 100000): Promise<ContactForSend[]> {
  const rows = await supabaseRestAll<ContactForSend[]>(`email_contacts?select=${CONTACT_COLUMNS}&status=eq.subscribed&order=created_at.asc`, 1000, maxRows);
  return rows.filter((contact) => evaluateSegment(definition, contact, nowMs));
}

export type PrepareResult = { ok: true; recipients: number } | { ok: false; error: string };

/**
 * Freezes the campaign's content and audience, queues one send row per recipient and marks it as
 * sending (or scheduled, when a future time is given). Safe to call twice: recipients are unique.
 */
export async function prepareCampaign(campaign: CampaignRow, mode: "send_now" | "schedule", nowMs: number = Date.now()): Promise<PrepareResult> {
  if (campaign.status !== "draft" && campaign.status !== "scheduled") return { ok: false, error: "This campaign has already been sent or canceled." };
  if (!campaign.template_id) return { ok: false, error: "Choose a template first." };
  if (!campaign.segment_id) return { ok: false, error: "Choose who it goes to." };

  const [templateRows, segmentRows] = await Promise.all([
    supabaseRest<Array<{ name: string; subject: string; preheader: string; design: unknown; blocks: unknown }>>(`email_templates?id=eq.${campaign.template_id}&select=name,subject,preheader,design,blocks&limit=1`, { noStore: true }),
    supabaseRest<Array<{ definition: unknown }>>(`email_segments?id=eq.${campaign.segment_id}&select=definition&limit=1`, { noStore: true }),
  ]);
  if (!templateRows[0]) return { ok: false, error: "The template was deleted. Choose another." };
  if (!segmentRows[0]) return { ok: false, error: "The segment was deleted. Choose another." };
  const { template } = cleanTemplate(templateRows[0]);
  const { definition } = cleanDefinition(segmentRows[0].definition);
  const subject = campaign.subject || template.subject;
  if (!subject.trim()) return { ok: false, error: "Add a subject line before sending." };
  if (!template.blocks.length) return { ok: false, error: "The template is empty. Add some content first." };

  const audience = await audienceFor(definition, nowMs);
  if (!audience.length) return { ok: false, error: "Nobody in that segment can be emailed right now." };

  if (mode === "schedule") {
    if (!campaign.scheduled_at) return { ok: false, error: "Pick a send time." };
    await supabaseRest(`email_campaigns?id=eq.${campaign.id}`, { method: "PATCH", body: { status: "scheduled", content: { ...template, subject, preheader: campaign.preheader || template.preheader }, segment_definition: definition, recipients_total: audience.length, updated_at: new Date(nowMs).toISOString() }, prefer: "return=minimal" });
    return { ok: true, recipients: audience.length };
  }

  await queueRecipients(campaign.id, audience);
  await supabaseRest(`email_campaigns?id=eq.${campaign.id}`, { method: "PATCH", body: { status: "sending", content: { ...template, subject, preheader: campaign.preheader || template.preheader }, segment_definition: definition, scheduled_at: null, started_at: new Date(nowMs).toISOString(), recipients_total: audience.length, updated_at: new Date(nowMs).toISOString() }, prefer: "return=minimal" });
  return { ok: true, recipients: audience.length };
}

async function queueRecipients(campaignId: string, audience: ContactForSend[]) {
  for (let i = 0; i < audience.length; i += 500) {
    const rows = audience.slice(i, i + 500).map((contact) => ({ campaign_id: campaignId, contact_id: contact.id, email: contact.email }));
    await supabaseRest("email_campaign_sends?on_conflict=campaign_id,contact_id", { method: "POST", body: rows, prefer: "resolution=ignore-duplicates,return=minimal" });
  }
}

export async function cancelCampaign(id: string, nowMs: number = Date.now()): Promise<void> {
  const at = new Date(nowMs).toISOString();
  // Anything not yet sent is dropped; what already went out stays in the log.
  await supabaseRest(`email_campaign_sends?campaign_id=eq.${id}&status=eq.queued`, { method: "PATCH", body: { status: "skipped", error: "Campaign canceled" }, prefer: "return=minimal" });
  await supabaseRest(`email_campaigns?id=eq.${id}&status=in.(scheduled,sending)`, { method: "PATCH", body: { status: "canceled", canceled_at: at, updated_at: at }, prefer: "return=minimal" });
}

type QueuedSend = { id: string; contact_id: string; email: string; attempts: number };

async function sentInLastDay(nowMs: number): Promise<number> {
  const since = new Date(nowMs - DAY_MS).toISOString();
  const { total } = await supabaseRestPage<{ id: string }>(`email_campaign_sends?select=id&status=eq.sent&sent_at=gte.${encodeURIComponent(since)}`, { from: 0, to: 0 }, { noStore: true });
  return total;
}

export type BatchOutcome = { sent: number; failed: number; skipped: number; remaining: number; capped: boolean; done: boolean };

/** Sends one batch (up to 100) for a sending campaign. */
export async function processCampaignBatch(campaignId: string, nowMs: number = Date.now()): Promise<BatchOutcome> {
  const campaign = await getCampaign(campaignId);
  if (!campaign || campaign.status !== "sending" || !campaign.content) return { sent: 0, failed: 0, skipped: 0, remaining: 0, capped: false, done: true };

  const config = sendConfig();
  if (sendingProblems(config).length) return { sent: 0, failed: 0, skipped: 0, remaining: -1, capped: false, done: false };
  const { settings } = await loadEmailSettings();

  const used = await sentInLastDay(nowMs);
  const room = Math.max(0, settings.dailyCap - used);
  if (room === 0) {
    const { total } = await supabaseRestPage<{ id: string }>(`email_campaign_sends?select=id&campaign_id=eq.${campaignId}&status=eq.queued`, { from: 0, to: 0 }, { noStore: true });
    return { sent: 0, failed: 0, skipped: 0, remaining: total, capped: true, done: false };
  }

  const queued = await supabaseRest<QueuedSend[]>(`email_campaign_sends?campaign_id=eq.${campaignId}&status=eq.queued&select=id,contact_id,email,attempts&order=created_at.asc&limit=${Math.min(BATCH_SIZE, room)}`, { noStore: true });
  if (!queued.length) {
    await finishCampaign(campaignId, nowMs);
    return { sent: 0, failed: 0, skipped: 0, remaining: 0, capped: false, done: true };
  }

  // Re-check each contact right before sending: they may have unsubscribed since the queue was built.
  const contacts = await supabaseRest<Array<{ id: string; email: string; token: string; status: string; emails_sent: number }>>(`email_contacts?id=in.(${queued.map((row) => row.contact_id).join(",")})&select=id,email,token,status,emails_sent`, { noStore: true });
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  const sendable: Array<{ row: QueuedSend; contact: { id: string; email: string; token: string; emails_sent: number } }> = [];
  let skipped = 0;
  for (const row of queued) {
    const contact = byId.get(row.contact_id);
    if (!contact || contact.status !== "subscribed") {
      skipped += 1;
      await supabaseRest(`email_campaign_sends?id=eq.${row.id}`, { method: "PATCH", body: { status: "skipped", error: "No longer subscribed" }, prefer: "return=minimal" });
    } else sendable.push({ row, contact });
  }

  let sent = 0;
  let failed = 0;
  if (sendable.length) {
    const products = await resolveProducts(campaign.content.blocks);
    const messages = sendable.map(({ contact }) => buildMessage(campaign.content as EmailTemplateData, campaign.subject || campaign.content!.subject, campaign.preheader, contact, campaignId, settings, config.mailingAddress, products));
    const key = `campaign-${campaignId}-${createHash("sha1").update(sendable.map(({ row }) => row.id).join(",")).digest("hex").slice(0, 24)}`;
    const result = await resendRequest("/emails/batch", config.apiKey, messages, key).catch((error) => ({ ok: false, status: 0, json: { message: error instanceof Error ? error.message : "Network error" } }));
    const at = new Date(nowMs).toISOString();
    if (result.ok && Array.isArray(result.json?.data)) {
      await Promise.all(sendable.map(({ row }, index) => supabaseRest(`email_campaign_sends?id=eq.${row.id}`, { method: "PATCH", body: { status: "sent", resend_id: result.json.data[index]?.id ?? null, sent_at: at, attempts: row.attempts + 1, error: null }, prefer: "return=minimal" })));
      sent = sendable.length;
      // The webhook does not report "sent", so keep each person's received-count and timeline here.
      await Promise.all(sendable.flatMap(({ contact }) => [
        supabaseRest(`email_contacts?id=eq.${contact.id}`, { method: "PATCH", body: { emails_sent: (contact.emails_sent ?? 0) + 1, updated_at: at }, prefer: "return=minimal" }),
        supabaseRest("email_contact_events", { method: "POST", body: { contact_id: contact.id, type: "email_sent", created_at: at, meta: { campaign: campaignId, subject: campaign.subject || campaign.content?.subject || "" } }, prefer: "return=minimal" }),
      ]).map((request) => request.catch((error) => console.error("contact update after send failed", error))));
    } else {
      const message = String(result.json?.message ?? `Resend returned ${result.status}`).slice(0, 300);
      await Promise.all(sendable.map(({ row }) => {
        const attempts = row.attempts + 1;
        return supabaseRest(`email_campaign_sends?id=eq.${row.id}`, { method: "PATCH", body: { attempts, error: message, ...(attempts >= MAX_ATTEMPTS ? { status: "failed" } : {}) }, prefer: "return=minimal" });
      }));
      failed = sendable.length;
    }
  }

  const { total } = await supabaseRestPage<{ id: string }>(`email_campaign_sends?select=id&campaign_id=eq.${campaignId}&status=eq.queued`, { from: 0, to: 0 }, { noStore: true });
  if (total === 0) await finishCampaign(campaignId, nowMs);
  return { sent, failed, skipped, remaining: total, capped: false, done: total === 0 };
}

async function finishCampaign(id: string, nowMs: number) {
  const at = new Date(nowMs).toISOString();
  await supabaseRest(`email_campaigns?id=eq.${id}&status=eq.sending`, { method: "PATCH", body: { status: "sent", completed_at: at, updated_at: at }, prefer: "return=minimal" });
}

export type QueueRun = { started: number; batches: number; sent: number; failed: number; capped: boolean; blocked: string | null };

/**
 * One pass over everything due: scheduled campaigns whose time has come are started, then sending
 * campaigns are worked through batch by batch until the time budget runs out. Called by the cron
 * endpoint and right after "Send now".
 */
export async function runEmailQueue(nowMs: number = Date.now(), budgetMs = 40_000, pauseMs = 600): Promise<QueueRun> {
  const out: QueueRun = { started: 0, batches: 0, sent: 0, failed: 0, capped: false, blocked: null };
  if (!hasSupabaseCatalog()) return out;
  const problems = sendingProblems(sendConfig());
  if (problems.length) { out.blocked = problems[0]; return out; }
  const deadline = Date.now() + budgetMs;

  const due = await supabaseRest<Array<{ id: string }>>(`email_campaigns?status=eq.scheduled&scheduled_at=lte.${encodeURIComponent(new Date(nowMs).toISOString())}&select=id&order=scheduled_at.asc&limit=20`, { noStore: true });
  for (const { id } of due) {
    const campaign = await getCampaign(id);
    if (!campaign?.segment_definition || !campaign.content) continue;
    // Use the frozen audience from when it was scheduled, but only people who are still subscribed.
    const audience = await audienceFor(campaign.segment_definition, nowMs);
    if (!audience.length) { await supabaseRest(`email_campaigns?id=eq.${id}`, { method: "PATCH", body: { status: "canceled", canceled_at: new Date(nowMs).toISOString() }, prefer: "return=minimal" }); continue; }
    await queueRecipients(id, audience);
    await supabaseRest(`email_campaigns?id=eq.${id}&status=eq.scheduled`, { method: "PATCH", body: { status: "sending", started_at: new Date(nowMs).toISOString(), recipients_total: audience.length }, prefer: "return=minimal" });
    out.started += 1;
  }

  const sending = await supabaseRest<Array<{ id: string }>>("email_campaigns?status=eq.sending&select=id&order=started_at.asc&limit=20", { noStore: true });
  for (const { id } of sending) {
    while (Date.now() < deadline) {
      const batch = await processCampaignBatch(id, Date.now());
      out.batches += 1;
      out.sent += batch.sent;
      out.failed += batch.failed;
      if (batch.capped) { out.capped = true; break; }
      if (batch.done || batch.remaining < 0) break;
      if (batch.sent === 0 && batch.failed === 0 && batch.skipped === 0) break;
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
    if (out.capped || Date.now() >= deadline) break;
  }
  return out;
}
