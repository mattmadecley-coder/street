import { readAdminState, writeAdminState } from "@/lib/admin-state";
import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";
import { cleanCriteria, criteriaToParams, paramsToQuery, isEmptyCriteria, type ProductCriteria } from "@/lib/product-criteria";

/**
 * Smart (rule-based) collections. The rules live in admin_state ("smart_collection_rules"), keyed by
 * collection id. A sync turns the rules into the collection's real product list, so the storefront
 * and homepage keep reading the same collection_products table and need no changes.
 */
export const SMART_ORDERS = [
  { value: "newest", label: "Newest first", order: "created_at.desc" },
  { value: "price_asc", label: "Price: low to high", order: "price.asc" },
  { value: "price_desc", label: "Price: high to low", order: "price.desc" },
] as const;
export type SmartOrder = (typeof SMART_ORDERS)[number]["value"];

export type SmartRules = { enabled: boolean; criteria: ProductCriteria; order: SmartOrder; limit: number; lastSyncAt?: string; lastCount?: number };
export type SmartRulesMap = Record<string, SmartRules>;

export const DEFAULT_SMART_LIMIT = 60;
export const MAX_SMART_LIMIT = 300;
const MAX_RULESETS = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cleanSmartRules(input: unknown): SmartRules {
  const raw = (typeof input === "object" && input ? input : {}) as Record<string, unknown>;
  const order = SMART_ORDERS.some((entry) => entry.value === raw.order) ? (raw.order as SmartOrder) : "newest";
  const limit = Math.min(Math.max(Math.trunc(Number(raw.limit)) || DEFAULT_SMART_LIMIT, 1), MAX_SMART_LIMIT);
  const out: SmartRules = { enabled: raw.enabled === true || raw.enabled === "on" || raw.enabled === "true", criteria: cleanCriteria(raw.criteria), order, limit };
  if (typeof raw.lastSyncAt === "string" && !Number.isNaN(Date.parse(raw.lastSyncAt))) out.lastSyncAt = raw.lastSyncAt;
  if (typeof raw.lastCount === "number" && Number.isInteger(raw.lastCount) && raw.lastCount >= 0) out.lastCount = raw.lastCount;
  return out;
}

export function sanitizeSmartRules(value: unknown): SmartRulesMap {
  const out: SmartRulesMap = {};
  if (typeof value !== "object" || !value) return out;
  for (const [id, raw] of Object.entries(value as Record<string, unknown>).slice(0, MAX_RULESETS)) {
    if (UUID.test(id)) out[id] = cleanSmartRules(raw);
  }
  return out;
}

/** A rule set that would match every product is refused: it would swallow the whole catalog. */
export function validateSmartRules(rules: SmartRules): string | null {
  if (rules.enabled && isEmptyCriteria(rules.criteria)) return "Add at least one rule, or this collection would contain every product.";
  return null;
}

/** What to add and remove so `current` becomes `target`, plus whether the order changed. */
export function diffMembership(current: string[], target: string[]): { add: string[]; remove: string[]; reordered: boolean } {
  const have = new Set(current);
  const want = new Set(target);
  const add = target.filter((id) => !have.has(id));
  const remove = current.filter((id) => !want.has(id));
  const keptCurrent = current.filter((id) => want.has(id));
  const keptTarget = target.filter((id) => have.has(id));
  const reordered = keptCurrent.length !== keptTarget.length || keptCurrent.some((id, index) => id !== keptTarget[index]);
  return { add, remove, reordered };
}

export async function loadSmartRules(): Promise<{ rules: SmartRulesMap; available: boolean }> {
  const { value, available } = await readAdminState<unknown>("smart_collection_rules", {});
  return { rules: sanitizeSmartRules(value), available };
}

export async function saveSmartRules(map: SmartRulesMap): Promise<void> {
  await writeAdminState("smart_collection_rules", map);
}

type MatchRow = { id: string; price: string | number; compare_at_price: string | number | null };

/** Product ids that match, in the rule's order, capped at the rule's limit. */
export async function findMatchingProductIds(rules: Pick<SmartRules, "criteria" | "order" | "limit">, nowMs: number = Date.now()): Promise<string[]> {
  if (!hasSupabaseCatalog()) return [];
  const order = SMART_ORDERS.find((entry) => entry.value === rules.order)?.order ?? "created_at.desc";
  const params = criteriaToParams(rules.criteria, nowMs);
  params.push(["select", "id,price,compare_at_price,brands!inner(slug)"], ["order", `${order},id.asc`]);
  if (!rules.criteria.brands?.length) params.push(["deleted_at", "is.null"]);
  else params.push(["deleted_at", "is.null"]);
  const want = rules.criteria.onSale ? Math.min(rules.limit * 5, 1000) : rules.limit;
  const rows = await supabaseRest<MatchRow[]>(`products?${paramsToQuery(params)}&limit=${want}`, { noStore: true });
  const matched = rules.criteria.onSale ? rows.filter((row) => row.compare_at_price != null && Number(row.compare_at_price) > Number(row.price)) : rows;
  return matched.slice(0, rules.limit).map((row) => row.id);
}

/** Makes the collection's products match its rules. Returns what changed. */
export async function syncSmartCollection(collectionId: string, rules: SmartRules): Promise<{ added: number; removed: number; total: number }> {
  const problem = validateSmartRules(rules);
  if (problem) throw new Error(problem);
  const target = await findMatchingProductIds(rules);
  const links = await supabaseRest<Array<{ product_id: string }>>(`collection_products?collection_id=eq.${collectionId}&select=product_id&order=sort_order.asc&limit=2000`, { noStore: true });
  const diff = diffMembership(links.map((link) => link.product_id), target);
  if (diff.remove.length) {
    await supabaseRest(`collection_products?collection_id=eq.${collectionId}&product_id=in.(${diff.remove.join(",")})`, { method: "DELETE", prefer: "return=minimal" });
  }
  if (target.length && (diff.add.length || diff.reordered)) {
    await supabaseRest("collection_products?on_conflict=collection_id,product_id", {
      method: "POST",
      body: target.map((productId, index) => ({ collection_id: collectionId, product_id: productId, sort_order: index })),
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  }
  return { added: diff.add.length, removed: diff.remove.length, total: target.length };
}

/** Syncs every enabled smart collection and records when. Used by the daily job. */
export async function syncAllSmartCollections(nowMs: number = Date.now()): Promise<{ synced: number; errors: string[] }> {
  const { rules, available } = await loadSmartRules();
  if (!available) return { synced: 0, errors: [] };
  const errors: string[] = [];
  let synced = 0;
  const next: SmartRulesMap = { ...rules };
  for (const [id, entry] of Object.entries(rules)) {
    if (!entry.enabled) continue;
    try {
      const result = await syncSmartCollection(id, entry);
      next[id] = { ...entry, lastSyncAt: new Date(nowMs).toISOString(), lastCount: result.total };
      synced += 1;
    } catch (error) {
      errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (synced) await saveSmartRules(next);
  return { synced, errors };
}
