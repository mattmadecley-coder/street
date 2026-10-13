import { hasSupabaseCatalog, supabaseRest, supabaseRestAll } from "@/lib/supabase-rest";
import { isMissingTableError } from "@/lib/admin-state";
import { cleanDefinition, type SegmentContactRow, type SegmentDefinition, type SegmentField } from "@/lib/email-segments-core";

export * from "@/lib/email-segments-core";

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

// Storage (table email_segments, migration 20261017) (table email_segments, migration 20261017)

export type SegmentRow = { id: string; name: string; description: string; definition: SegmentDefinition; created_by: string | null; created_at: string; updated_at: string };

type StoredRow = Omit<SegmentRow, "definition"> & { definition: unknown };
const toRow = (row: StoredRow): SegmentRow => ({ ...row, definition: cleanDefinition(row.definition).definition });

export async function listSegments(): Promise<{ segments: SegmentRow[]; available: boolean }> {
  if (!hasSupabaseCatalog()) return { segments: [], available: false };
  try {
    const rows = await supabaseRest<StoredRow[]>("email_segments?select=*&order=name.asc&limit=500", { noStore: true });
    return { segments: rows.map(toRow), available: true };
  } catch (error) {
    if (isMissingTableError(error)) return { segments: [], available: false };
    throw error;
  }
}

export async function getSegment(id: string): Promise<SegmentRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !hasSupabaseCatalog()) return null;
  try {
    const rows = await supabaseRest<StoredRow[]>(`email_segments?id=eq.${id}&select=*&limit=1`, { noStore: true });
    return rows[0] ? toRow(rows[0]) : null;
  } catch (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
}

export function cleanSegmentName(value: unknown): string {
  const name = text(value, 80);
  if (!name) throw new Error("Give the segment a name.");
  return name;
}

export async function saveSegment(input: { id?: string; name: string; description?: string; definition: SegmentDefinition; actor: string }): Promise<string> {
  const body = { name: cleanSegmentName(input.name), description: text(input.description, 300), definition: cleanDefinition(input.definition).definition, updated_at: new Date().toISOString() };
  try {
    if (input.id) {
      await supabaseRest(`email_segments?id=eq.${input.id}`, { method: "PATCH", body, prefer: "return=minimal" });
      return input.id;
    }
    const rows = await supabaseRest<Array<{ id: string }>>("email_segments", { method: "POST", body: { ...body, created_by: input.actor.slice(0, 120) }, prefer: "return=representation" });
    return rows[0].id;
  } catch (error) {
    if (/duplicate key|unique/i.test(error instanceof Error ? error.message : "")) throw new Error("A segment with that name already exists.");
    throw error;
  }
}

export async function deleteSegment(id: string): Promise<void> {
  await supabaseRest(`email_segments?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });
}

const CONTACT_COLUMNS = "id,email,status,phone,tags,created_at,emails_sent,open_count,click_count,last_opened_at,last_clicked_at,source,utm_source,utm_medium,utm_campaign,device_type,signup_path";

/** Loads contacts (capped) so segments can be counted and previewed. Returns how many exist in total. */
export async function loadContactsForSegments(maxRows = 50000): Promise<{ contacts: SegmentContactRow[]; truncated: boolean }> {
  if (!hasSupabaseCatalog()) return { contacts: [], truncated: false };
  const rows = await supabaseRestAll<SegmentContactRow[]>(`email_contacts?select=${CONTACT_COLUMNS}&order=created_at.desc`, 1000, maxRows);
  return { contacts: rows, truncated: rows.length >= maxRows };
}

