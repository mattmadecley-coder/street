import { supabaseRest } from "@/lib/supabase-rest";

/**
 * Bulk product actions for the review queue. Deliberately conservative (this is a "bulk catalog
 * operation", so it follows the project's Level 3 care):
 *  - at most MAX_BULK products per request, and every id must be a real UUID;
 *  - "approve" only touches products that are currently "needs review" AND already have a category,
 *    so it can never quietly bless an unclassified product or overwrite a human decision;
 *  - nothing here can permanently delete: "trash" is a recoverable soft delete and is refused when
 *    the trash column is not available yet;
 *  - the result says exactly how many products changed and how many were skipped.
 */
import { BULK_INTENTS, BULK_LABELS, MAX_BULK, bulkMessage, isBulkIntent, type BulkIntent } from "@/lib/product-bulk-shared";
export { BULK_INTENTS, BULK_LABELS, MAX_BULK, bulkMessage, isBulkIntent };
export type { BulkIntent };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseBulkIds(values: unknown[]): { ok: true; ids: string[] } | { ok: false; error: string } {
  const ids = [...new Set(values.map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean))];
  if (ids.length === 0) return { ok: false, error: "Select at least one product first." };
  if (ids.length > MAX_BULK) return { ok: false, error: `Select at most ${MAX_BULK} products at a time (you picked ${ids.length}).` };
  if (!ids.every((id) => UUID.test(id))) return { ok: false, error: "One of the selected products has an invalid id." };
  return { ok: true, ids };
}

export async function runBulk(intent: BulkIntent, ids: string[], options: { trashOn: boolean; nowIso?: string }): Promise<{ changed: number; skipped: number }> {
  const list = `id=in.(${ids.join(",")})`;
  const nowIso = options.nowIso ?? new Date().toISOString();
  let path: string;
  let body: Record<string, unknown>;

  switch (intent) {
    case "approve":
      path = `products?${list}&classification_status=eq.needs_review&street_category=not.is.null&select=id`;
      body = { classification_status: "classified", classification_confidence: "manual", classification_model: "manual-admin", classification_error: null, classified_at: nowIso };
      break;
    case "hide":
      path = `products?${list}&select=id`;
      body = { is_hidden: true };
      break;
    case "unhide":
      // Never resurrect something that is in the trash.
      path = `products?${list}${options.trashOn ? "&deleted_at=is.null" : ""}&select=id`;
      body = { is_hidden: false };
      break;
    case "trash":
      if (!options.trashOn) throw new Error("Bulk delete needs the trash feature (database update 20261015). Use Hide instead for now.");
      path = `products?${list}&deleted_at=is.null&select=id`;
      body = { deleted_at: nowIso, is_hidden: true };
      break;
  }

  const rows = await supabaseRest<Array<{ id: string }>>(path, { method: "PATCH", body, prefer: "return=representation" });
  const changed = Array.isArray(rows) ? rows.length : 0;
  return { changed, skipped: ids.length - changed };
}
