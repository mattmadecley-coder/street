import { readAdminState } from "@/lib/admin-state";

/** The four fallback homepage settings a version captures. */
export type HomepageSnapshot = {
  hero_image_url: string;
  hero_video_url: string;
  featured_brand_slug: string;
  featured_brand_cta_label: string;
};

export type HomepageVersion = {
  /** ISO time the settings were REPLACED (so "restore" brings back what was live before then). */
  at: string;
  /** Who replaced them. */
  by: string;
  settings: HomepageSnapshot;
};

export const MAX_HOMEPAGE_VERSIONS = 20;
const KEYS: Array<keyof HomepageSnapshot> = ["hero_image_url", "hero_video_url", "featured_brand_slug", "featured_brand_cta_label"];

export function snapshotsEqual(a: HomepageSnapshot, b: HomepageSnapshot): boolean {
  return KEYS.every((key) => (a[key] ?? "") === (b[key] ?? ""));
}

function cleanSnapshot(input: unknown): HomepageSnapshot | null {
  if (typeof input !== "object" || !input) return null;
  const raw = input as Record<string, unknown>;
  const out = {} as HomepageSnapshot;
  for (const key of KEYS) {
    const value = raw[key];
    if (value !== undefined && typeof value !== "string") return null;
    out[key] = typeof value === "string" ? value.slice(0, 2000) : "";
  }
  return out;
}

/** Only well-formed entries survive, newest first, capped, so hand-edited data cannot break the page or a restore. */
export function sanitizeHistory(value: unknown): HomepageVersion[] {
  const items = typeof value === "object" && value && Array.isArray((value as { items?: unknown }).items) ? (value as { items: unknown[] }).items : [];
  const out: HomepageVersion[] = [];
  for (const item of items) {
    if (typeof item !== "object" || !item) continue;
    const raw = item as Record<string, unknown>;
    const settings = cleanSnapshot(raw.settings);
    const at = typeof raw.at === "string" && !Number.isNaN(Date.parse(raw.at)) ? raw.at : null;
    if (!settings || !at) continue;
    out.push({ at, by: typeof raw.by === "string" ? raw.by.slice(0, 200) : "unknown", settings });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_HOMEPAGE_VERSIONS);
}

/**
 * Records the settings that are about to be replaced. Nothing is recorded when the new settings are
 * identical to the old (so saving without changes does not flood the history).
 */
export function recordReplaced(history: HomepageVersion[], replaced: HomepageSnapshot, next: HomepageSnapshot, by: string, atIso: string): HomepageVersion[] {
  if (snapshotsEqual(replaced, next)) return history;
  return [{ at: atIso, by, settings: replaced }, ...history].slice(0, MAX_HOMEPAGE_VERSIONS);
}

export async function loadHomepageHistory(): Promise<{ items: HomepageVersion[]; available: boolean }> {
  try {
    const { value, available } = await readAdminState<unknown>("homepage_history", { items: [] });
    return { items: sanitizeHistory(value), available };
  } catch {
    return { items: [], available: false };
  }
}
