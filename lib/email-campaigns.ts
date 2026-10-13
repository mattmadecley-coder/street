import { hasSupabaseCatalog, supabaseRest, supabaseRestAll, supabaseRestPage } from "@/lib/supabase-rest";
import { isMissingTableError } from "@/lib/admin-state";
import { cleanTemplate, type EmailTemplateData } from "@/lib/email-blocks";
import { cleanDefinition, type SegmentDefinition } from "@/lib/email-segments-core";

export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "canceled";

export type CampaignRow = {
  id: string;
  name: string;
  status: CampaignStatus;
  template_id: string | null;
  segment_id: string | null;
  subject: string;
  preheader: string;
  content: EmailTemplateData | null;
  segment_definition: SegmentDefinition | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  recipients_total: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type Stored = Omit<CampaignRow, "content" | "segment_definition"> & { content: unknown; segment_definition: unknown };

function toRow(row: Stored): CampaignRow {
  return {
    ...row,
    content: row.content ? cleanTemplate(row.content).template : null,
    segment_definition: row.segment_definition ? cleanDefinition(row.segment_definition).definition : null,
  };
}

const line = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

export async function listCampaigns(): Promise<{ campaigns: CampaignRow[]; available: boolean }> {
  if (!hasSupabaseCatalog()) return { campaigns: [], available: false };
  try {
    const rows = await supabaseRest<Stored[]>("email_campaigns?select=*&order=created_at.desc&limit=300", { noStore: true });
    return { campaigns: rows.map(toRow), available: true };
  } catch (error) {
    if (isMissingTableError(error)) return { campaigns: [], available: false };
    throw error;
  }
}

export async function getCampaign(id: string): Promise<CampaignRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !hasSupabaseCatalog()) return null;
  try {
    const rows = await supabaseRest<Stored[]>(`email_campaigns?id=eq.${id}&select=*&limit=1`, { noStore: true });
    return rows[0] ? toRow(rows[0]) : null;
  } catch (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
}

export async function createCampaign(actor: string, name = "Untitled campaign"): Promise<string> {
  const rows = await supabaseRest<Array<{ id: string }>>("email_campaigns", { method: "POST", body: { name: line(name, 80) || "Untitled campaign", created_by: actor.slice(0, 120) }, prefer: "return=representation" });
  return rows[0].id;
}

export type CampaignDraftInput = { name?: unknown; templateId?: unknown; segmentId?: unknown; subject?: unknown; preheader?: unknown; scheduledAt?: unknown };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parses a schedule time. Returns null for blank, throws for nonsense or a time in the past. */
export function parseScheduledAt(value: unknown, nowMs: number): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const at = Date.parse(value);
  if (!Number.isFinite(at)) throw new Error("That send time isn't a valid date.");
  if (at < nowMs - 60_000) throw new Error("The send time is in the past.");
  if (at > nowMs + 366 * 86_400_000) throw new Error("Pick a send time within the next year.");
  return new Date(at).toISOString();
}

export async function saveDraft(id: string, input: CampaignDraftInput, nowMs: number = Date.now()): Promise<void> {
  const body: Record<string, unknown> = { updated_at: new Date(nowMs).toISOString() };
  if (input.name !== undefined) body.name = line(input.name, 80) || "Untitled campaign";
  if (input.templateId !== undefined) body.template_id = typeof input.templateId === "string" && UUID.test(input.templateId) ? input.templateId : null;
  if (input.segmentId !== undefined) body.segment_id = typeof input.segmentId === "string" && UUID.test(input.segmentId) ? input.segmentId : null;
  if (input.subject !== undefined) body.subject = line(input.subject, 200);
  if (input.preheader !== undefined) body.preheader = line(input.preheader, 200);
  if (input.scheduledAt !== undefined) body.scheduled_at = parseScheduledAt(input.scheduledAt, nowMs);
  await supabaseRest(`email_campaigns?id=eq.${id}&status=in.(draft,scheduled)`, { method: "PATCH", body, prefer: "return=minimal" });
}

export async function deleteCampaign(id: string): Promise<void> {
  await supabaseRest(`email_campaigns?id=eq.${id}&status=in.(draft,canceled)`, { method: "DELETE", prefer: "return=minimal" });
}

// ---------------------------------------------------------------------------
// Results

export type SendRow = {
  id: string; contact_id: string; email: string; status: "queued" | "sent" | "failed" | "skipped"; error: string | null;
  sent_at: string | null; delivered_at: string | null; first_opened_at: string | null; open_count: number;
  first_clicked_at: string | null; click_count: number; bounced_at: string | null; complained_at: string | null;
};

export type CampaignStats = {
  recipients: number; queued: number; sent: number; failed: number; skipped: number;
  delivered: number; opened: number; clicked: number; bounced: number; complained: number; unsubscribed: number;
};

export const EMPTY_STATS: CampaignStats = { recipients: 0, queued: 0, sent: 0, failed: 0, skipped: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, unsubscribed: 0 };

/** People (not events): someone who opened twice counts once. A click implies an open for rate purposes. */
export function computeStats(rows: SendRow[], unsubscribed = 0): CampaignStats {
  const stats: CampaignStats = { ...EMPTY_STATS, recipients: rows.length, unsubscribed };
  for (const row of rows) {
    stats[row.status] += 1;
    if (row.delivered_at) stats.delivered += 1;
    if (row.first_opened_at || row.open_count > 0 || row.click_count > 0) stats.opened += 1;
    if (row.first_clicked_at || row.click_count > 0) stats.clicked += 1;
    if (row.bounced_at) stats.bounced += 1;
    if (row.complained_at) stats.complained += 1;
  }
  return stats;
}

export async function loadCampaignSends(campaignId: string, maxRows = 20000): Promise<SendRow[]> {
  if (!hasSupabaseCatalog()) return [];
  return supabaseRestAll<SendRow[]>(`email_campaign_sends?campaign_id=eq.${campaignId}&select=id,contact_id,email,status,error,sent_at,delivered_at,first_opened_at,open_count,first_clicked_at,click_count,bounced_at,complained_at&order=created_at.asc`, 1000, maxRows);
}

export async function countUnsubscribes(campaignId: string): Promise<number> {
  try {
    const { total } = await supabaseRestPage<{ id: string }>(`email_contact_events?select=id&type=eq.unsubscribed&meta->>campaign=eq.${campaignId}`, { from: 0, to: 0 }, { noStore: true });
    return total;
  } catch {
    return 0;
  }
}

export const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 1000) / 10}%` : "–");
