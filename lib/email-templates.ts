import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";
import { isMissingTableError } from "@/lib/admin-state";
import { cleanTemplate, type EmailTemplateData } from "@/lib/email-blocks";

/** Storage for reusable email layouts (table email_templates, migration 20261017). */
export type TemplateRow = EmailTemplateData & { id: string; created_by: string | null; created_at: string; updated_at: string; archived_at: string | null };

type Stored = { id: string; name: string; subject: string; preheader: string; design: unknown; blocks: unknown; created_by: string | null; created_at: string; updated_at: string; archived_at: string | null };

function toRow(row: Stored): TemplateRow {
  const { template } = cleanTemplate({ name: row.name, subject: row.subject, preheader: row.preheader, design: row.design, blocks: row.blocks });
  return { ...template, name: row.name, id: row.id, created_by: row.created_by, created_at: row.created_at, updated_at: row.updated_at, archived_at: row.archived_at };
}

export async function listTemplates(includeArchived = false): Promise<{ templates: TemplateRow[]; available: boolean }> {
  if (!hasSupabaseCatalog()) return { templates: [], available: false };
  try {
    const rows = await supabaseRest<Stored[]>(`email_templates?select=*&order=updated_at.desc&limit=500${includeArchived ? "" : "&archived_at=is.null"}`, { noStore: true });
    return { templates: rows.map(toRow), available: true };
  } catch (error) {
    if (isMissingTableError(error)) return { templates: [], available: false };
    throw error;
  }
}

export async function getTemplate(id: string): Promise<TemplateRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !hasSupabaseCatalog()) return null;
  try {
    const rows = await supabaseRest<Stored[]>(`email_templates?id=eq.${id}&select=*&limit=1`, { noStore: true });
    return rows[0] ? toRow(rows[0]) : null;
  } catch (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
}

function toBody(data: EmailTemplateData) {
  return { name: data.name || "Untitled email", subject: data.subject, preheader: data.preheader, design: data.design, blocks: data.blocks, updated_at: new Date().toISOString() };
}

export async function createTemplate(data: unknown, actor: string): Promise<string> {
  const { template } = cleanTemplate(data);
  const rows = await supabaseRest<Array<{ id: string }>>("email_templates", { method: "POST", body: { ...toBody(template), created_by: actor.slice(0, 120) }, prefer: "return=representation" });
  return rows[0].id;
}

/** Saves a layout. Everything is validated again here; the editor is never trusted. Returns what was actually stored. */
export async function updateTemplate(id: string, data: unknown): Promise<{ template: EmailTemplateData; dropped: number }> {
  const { template, dropped } = cleanTemplate(data);
  await supabaseRest(`email_templates?id=eq.${id}`, { method: "PATCH", body: toBody(template), prefer: "return=minimal" });
  return { template: { ...template, name: template.name || "Untitled email" }, dropped };
}

export async function setTemplateArchived(id: string, archived: boolean): Promise<void> {
  await supabaseRest(`email_templates?id=eq.${id}`, { method: "PATCH", body: { archived_at: archived ? new Date().toISOString() : null }, prefer: "return=minimal" });
}

export async function duplicateTemplate(id: string, actor: string): Promise<string | null> {
  const source = await getTemplate(id);
  if (!source) return null;
  return createTemplate({ name: `${source.name} (copy)`.slice(0, 80), subject: source.subject, preheader: source.preheader, design: source.design, blocks: source.blocks.map((block) => ({ ...block, id: undefined })) }, actor);
}
