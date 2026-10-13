/** Client-safe pieces of the bulk product feature (no database imports), shared with toasts and the bulk bar. */
export type BulkIntent = "approve" | "hide" | "unhide" | "trash";
export const BULK_INTENTS: readonly BulkIntent[] = ["approve", "hide", "unhide", "trash"];
export const MAX_BULK = 100;


export function isBulkIntent(value: unknown): value is BulkIntent {
  return typeof value === "string" && (BULK_INTENTS as readonly string[]).includes(value);
}

export const BULK_LABELS: Record<BulkIntent, { past: string; audit: string }> = {
  approve: { past: "Approved", audit: "product.bulk_approve" },
  hide: { past: "Hid", audit: "product.bulk_hide" },
  unhide: { past: "Showed", audit: "product.bulk_unhide" },
  trash: { past: "Moved to the trash", audit: "product.bulk_trash" },
};

/** The sentence shown in the confirmation toast, e.g. "Approved 12 products (3 skipped)". */
export function bulkMessage(intent: BulkIntent, changed: number, skipped: number): string {
  const noun = changed === 1 ? "product" : "products";
  const skippedText = skipped > 0 ? ` (${skipped} skipped${intent === "approve" ? ": not in review or no category yet" : ""})` : "";
  return `${BULK_LABELS[intent].past} ${changed} ${noun}${skippedText}.`;
}
