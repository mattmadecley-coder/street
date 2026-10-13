import { readAdminState } from "@/lib/admin-state";

/**
 * Per-brand permission record, supporting the project's rule: get a brand's permission,
 * an affiliate relationship or a sanctioned feed before scaling, and make it easy for a brand
 * to ask for correction or removal. Stored in admin_state ("brand_meta"), keyed by brand slug.
 */
export type PermissionStatus = "granted" | "requested" | "declined" | "none";

export const PERMISSION_OPTIONS: Array<{ value: PermissionStatus; label: string; help: string }> = [
  { value: "granted", label: "Permission granted", help: "The brand agreed to be listed, or we have an affiliate or feed agreement." },
  { value: "requested", label: "Asked, waiting", help: "We contacted the brand and have not heard back." },
  { value: "declined", label: "Declined / removal requested", help: "The brand asked to be removed or corrected. Hide it from the site." },
  { value: "none", label: "Not recorded", help: "Nothing recorded yet." },
];

export type BrandMeta = { permission: PermissionStatus; source: string; date: string; notes: string };
export type BrandMetaMap = Record<string, BrandMeta>;

export const MAX_BRAND_META = 1000;
export const EMPTY_META: BrandMeta = { permission: "none", source: "", date: "", notes: "" };

const isStatus = (value: unknown): value is PermissionStatus => typeof value === "string" && PERMISSION_OPTIONS.some((option) => option.value === value);

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Validates and trims one record from untrusted input (a form or stored JSON). */
export function cleanBrandMeta(input: { permission?: unknown; source?: unknown; date?: unknown; notes?: unknown }): BrandMeta {
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, max) : "");
  const date = text(input.date, 10);
  return {
    permission: isStatus(input.permission) ? input.permission : "none",
    source: text(input.source, 120).replace(/\s+/g, " "),
    date: validDate(date) ? date : "",
    notes: text(input.notes, 1000),
  };
}

export function sanitizeStoredMeta(value: unknown): BrandMetaMap {
  const out: BrandMetaMap = {};
  if (typeof value !== "object" || !value) return out;
  for (const [slug, raw] of Object.entries(value as Record<string, unknown>).slice(0, MAX_BRAND_META)) {
    if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug) || typeof raw !== "object" || !raw) continue;
    out[slug] = cleanBrandMeta(raw as Record<string, unknown>);
  }
  return out;
}

/** Returns a new map with the brand's record set. A record that is entirely empty removes the entry. */
export function withBrandMeta(map: BrandMetaMap, slug: string, meta: BrandMeta): BrandMetaMap {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) throw new Error("Invalid brand.");
  const next = { ...map };
  if (meta.permission === "none" && !meta.source && !meta.date && !meta.notes) delete next[slug];
  else next[slug] = meta;
  if (Object.keys(next).length > MAX_BRAND_META) throw new Error("Too many brand records.");
  return next;
}

export async function loadBrandMeta(): Promise<{ map: BrandMetaMap; available: boolean }> {
  try {
    const { value, available } = await readAdminState<unknown>("brand_meta", {});
    return { map: sanitizeStoredMeta(value), available };
  } catch {
    return { map: {}, available: false };
  }
}
