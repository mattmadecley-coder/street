import { readAdminState } from "@/lib/admin-state";

/** A dated note drawn on the analytics charts, e.g. "Broken Planet drop". */
export type Annotation = { id: string; date: string; text: string };

export const MAX_ANNOTATIONS = 100;
export const MAX_ANNOTATION_TEXT = 80;

/** Validates one annotation from untrusted input. Returns null when it is not usable. */
export function cleanAnnotation(input: { date?: unknown; text?: unknown }, makeId: () => string): Annotation | null {
  const date = typeof input.date === "string" ? input.date.trim() : "";
  const text = typeof input.text === "string" ? input.text.replace(/\s+/g, " ").trim().slice(0, MAX_ANNOTATION_TEXT) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !text) return null;
  // Date.parse quietly rolls impossible days over ("2026-02-31" becomes March 3), so round-trip the value.
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return { id: makeId(), date, text };
}

/** Adds an annotation, keeping the newest MAX_ANNOTATIONS and the list sorted by date. */
export function addAnnotation(list: Annotation[], annotation: Annotation): Annotation[] {
  return [...list, annotation].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_ANNOTATIONS);
}

export function removeAnnotation(list: Annotation[], id: string): Annotation[] {
  return list.filter((item) => item.id !== id);
}

/** Only well-formed stored entries survive, so a hand-edited row cannot break a chart. */
export function sanitizeStoredAnnotations(value: unknown): Annotation[] {
  const items = typeof value === "object" && value && Array.isArray((value as { items?: unknown }).items) ? (value as { items: unknown[] }).items : [];
  const result: Annotation[] = [];
  for (const item of items) {
    if (typeof item !== "object" || !item) continue;
    const row = item as Record<string, unknown>;
    const cleaned = cleanAnnotation(row, () => String(row.id ?? ""));
    if (cleaned && cleaned.id) result.push(cleaned);
  }
  return result;
}

export async function loadAnnotations(): Promise<{ items: Annotation[]; available: boolean }> {
  try {
    const { value, available } = await readAdminState<unknown>("analytics_annotations", { items: [] });
    return { items: sanitizeStoredAnnotations(value), available };
  } catch {
    return { items: [], available: false };
  }
}
