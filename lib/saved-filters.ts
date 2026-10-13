import { randomUUID } from "node:crypto";
import { readAdminState, writeAdminState, type AdminStateKey } from "@/lib/admin-state";

/**
 * Saved views for the product list ("Needs review from Brand X", "Sold out under $50"...). A view is
 * a name plus the list's own URL parameters, so opening one is just a link. Stored in admin_state.
 */
export const FILTER_PARAM_KEYS = ["status", "brand", "q", "group", "stock", "min", "max"] as const;
export type FilterParamKey = (typeof FILTER_PARAM_KEYS)[number];
export type SavedFilter = { id: string; name: string; params: Partial<Record<FilterParamKey, string>>; createdBy: string; createdAt: string };

export const MAX_SAVED_FILTERS = 30;
const STATE_KEY: AdminStateKey = "saved_product_filters";

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Keeps only the known parameters with plausible values. */
export function cleanFilterParams(input: unknown): SavedFilter["params"] {
  const raw = (typeof input === "object" && input ? input : {}) as Record<string, unknown>;
  const out: SavedFilter["params"] = {};
  for (const key of FILTER_PARAM_KEYS) {
    const value = clean(raw[key], key === "q" ? 120 : 80);
    if (!value) continue;
    if ((key === "min" || key === "max") && !(Number.isFinite(Number(value)) && Number(value) >= 0)) continue;
    if (key === "stock" && value !== "in_stock" && value !== "sold_out") continue;
    if (key === "brand" && !/^[a-z0-9][a-z0-9-]{0,80}$/.test(value)) continue;
    out[key] = value;
  }
  return out;
}

export function sanitizeSavedFilters(value: unknown): SavedFilter[] {
  if (!Array.isArray(value)) return [];
  const out: SavedFilter[] = [];
  for (const item of value.slice(0, MAX_SAVED_FILTERS)) {
    if (typeof item !== "object" || !item) continue;
    const row = item as Record<string, unknown>;
    const name = clean(row.name, 60);
    const id = clean(row.id, 64);
    if (!name || !/^[A-Za-z0-9-]{6,64}$/.test(id)) continue;
    out.push({ id, name, params: cleanFilterParams(row.params), createdBy: clean(row.createdBy, 120), createdAt: clean(row.createdAt, 40) });
  }
  return out;
}

export function filterHref(filter: Pick<SavedFilter, "params">): string {
  const search = new URLSearchParams();
  for (const key of FILTER_PARAM_KEYS) if (filter.params[key]) search.set(key, filter.params[key] as string);
  const query = search.toString();
  return query ? `/admin/products?${query}` : "/admin/products";
}

/** Returns a new list with the view added (same name replaces). Throws when the name is empty or the list is full. */
export function withSavedFilter(list: SavedFilter[], input: { name: string; params: unknown; createdBy: string }, now: Date = new Date(), makeId: () => string = randomUUID): SavedFilter[] {
  const name = clean(input.name, 60);
  if (!name) throw new Error("Give the view a name.");
  const params = cleanFilterParams(input.params);
  if (!Object.keys(params).length) throw new Error("Choose at least one filter before saving a view.");
  const rest = list.filter((entry) => entry.name.toLowerCase() !== name.toLowerCase());
  if (rest.length >= MAX_SAVED_FILTERS) throw new Error(`You can keep up to ${MAX_SAVED_FILTERS} saved views. Delete one first.`);
  return [...rest, { id: makeId(), name, params, createdBy: clean(input.createdBy, 120), createdAt: now.toISOString() }];
}

export function withoutSavedFilter(list: SavedFilter[], id: string): SavedFilter[] {
  return list.filter((entry) => entry.id !== id);
}

export async function loadSavedFilters(): Promise<{ filters: SavedFilter[]; available: boolean }> {
  const { value, available } = await readAdminState<unknown>(STATE_KEY, []);
  return { filters: sanitizeSavedFilters(value), available };
}

export async function saveSavedFilters(list: SavedFilter[]): Promise<void> {
  await writeAdminState(STATE_KEY, list);
}
