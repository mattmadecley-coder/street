// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as db from "./fakes/supabase-rest.ts";
import { cleanCriteria, criteriaToParams, paramsToQuery, describeCriteria, isEmptyCriteria } from "../lib/product-criteria.ts";
import { cleanSmartRules, sanitizeSmartRules, validateSmartRules, diffMembership, syncSmartCollection, syncAllSmartCollections, saveSmartRules, MAX_SMART_LIMIT } from "../lib/smart-collections.ts";
import { cleanFilterParams, sanitizeSavedFilters, withSavedFilter, withoutSavedFilter, filterHref, MAX_SAVED_FILTERS } from "../lib/saved-filters.ts";

const NOW = Date.parse("2026-10-13T12:00:00Z");
const COLLECTION = "11111111-1111-4111-8111-111111111111";

test("criteria: bad input is dropped, good input is trimmed", () => {
  const c = cleanCriteria({ q: "  heavy   hoodie ", brands: ["Good-Brand", "bad slug!", "good-brand"], group: "Nonsense", category: "Hoodies", minPrice: "20", maxPrice: "10", stock: "maybe", addedWithinDays: "7.5", tags: "a, b ,a" });
  assert.equal(c.q, "heavy hoodie");
  assert.deepEqual(c.brands, ["good-brand"]);
  assert.equal(c.group, undefined, "unknown group is dropped");
  assert.equal(c.category, undefined, "category needs a valid group");
  assert.equal(c.minPrice, 20);
  assert.equal(c.maxPrice, undefined, "max below min is dropped");
  assert.equal(c.stock, undefined);
  assert.equal(c.addedWithinDays, undefined, "whole days only");
  assert.deepEqual(c.tags, ["a", "b"]);
  assert.ok(isEmptyCriteria(cleanCriteria(null)));
  assert.ok(isEmptyCriteria(cleanCriteria("drop table")));
});

test("criteria: query parameters cover the live catalog and every rule", () => {
  const c = cleanCriteria({ q: "zip hoodie", brands: ["a", "b"], group: "Clothing", minPrice: 10, maxPrice: 80, stock: "in_stock", addedWithinDays: 14, tags: ["Vintage"] });
  const params = criteriaToParams(c, NOW);
  const get = (name) => params.filter(([n]) => n === name).map(([, v]) => v);
  assert.deepEqual(get("is_active"), ["eq.true"]);
  assert.deepEqual(get("is_hidden"), ["eq.false"]);
  assert.deepEqual(get("title"), ["ilike.*zip*", "ilike.*hoodie*"]);
  assert.deepEqual(get("brands.slug"), ['in.("a","b")']);
  assert.deepEqual(get("price"), ["gte.10", "lte.80"]);
  assert.deepEqual(get("stock_status"), ["eq.in_stock"]);
  assert.deepEqual(get("street_tags"), ['cs.{"Vintage"}']);
  assert.equal(get("created_at")[0], `gte.${new Date(NOW - 14 * 86_400_000).toISOString()}`);
  assert.match(paramsToQuery([["title", "ilike.*a b*"]]), /^title=ilike\.\*a%20b\*$/);
});

test("criteria: quotes and PostgREST syntax cannot be smuggled into a value", () => {
  const params = criteriaToParams(cleanCriteria({ q: "x),or=(id.neq.0", tags: ['a"},{"b'] }), NOW);
  const title = params.filter(([n]) => n === "title").map(([, v]) => v).join(" ");
  assert.ok(!/[(),]/.test(title.replace("ilike.", "")), title);
  const tag = params.find(([n]) => n === "street_tags")[1];
  assert.equal((tag.match(/"/g) ?? []).length, 2, tag);
  assert.match(describeCriteria(cleanCriteria({ brands: ["a"], maxPrice: 50 })), /brand a · under \$50/);
});

test("smart rules: limits, order and ids are normalised; empty rules cannot be switched on", () => {
  const rules = cleanSmartRules({ enabled: "on", criteria: {}, order: "weird", limit: 99999 });
  assert.equal(rules.order, "newest");
  assert.equal(rules.limit, MAX_SMART_LIMIT);
  assert.match(validateSmartRules(rules), /at least one rule/);
  assert.equal(validateSmartRules({ ...rules, enabled: false }), null);
  assert.equal(validateSmartRules(cleanSmartRules({ enabled: true, criteria: { maxPrice: 50 } })), null);
  assert.deepEqual(Object.keys(sanitizeSmartRules({ [COLLECTION]: { enabled: true }, "not-a-uuid": {} })), [COLLECTION]);
});

test("membership diff: add, remove and reorder are told apart", () => {
  assert.deepEqual(diffMembership(["a", "b"], ["a", "b"]), { add: [], remove: [], reordered: false });
  assert.deepEqual(diffMembership(["a", "b", "c"], ["b", "d"]), { add: ["d"], remove: ["a", "c"], reordered: false });
  assert.equal(diffMembership(["a", "b"], ["b", "a"]).reordered, true);
});

function seedProducts() {
  db.__reset();
  db.__table("products", [
    { id: "p1", price: 20, compare_at_price: null, is_active: true, is_hidden: false, deleted_at: null, created_at: "2026-10-10T00:00:00Z" },
    { id: "p2", price: 30, compare_at_price: 50, is_active: true, is_hidden: false, deleted_at: null, created_at: "2026-10-11T00:00:00Z" },
    { id: "p3", price: 200, compare_at_price: null, is_active: true, is_hidden: false, deleted_at: null, created_at: "2026-10-12T00:00:00Z" },
    { id: "p4", price: 25, compare_at_price: null, is_active: true, is_hidden: true, deleted_at: null, created_at: "2026-10-12T00:00:00Z" },
  ]);
  db.__table("collection_products", [
    { collection_id: COLLECTION, product_id: "p3", sort_order: 0 },
    { collection_id: COLLECTION, product_id: "stale", sort_order: 1 },
  ]);
  db.__table("admin_state");
}
beforeEach(seedProducts);

test("sync: the collection ends up with exactly the matching live products, in order", async () => {
  const rules = cleanSmartRules({ enabled: true, criteria: { maxPrice: 100 }, order: "newest", limit: 10 });
  const result = await syncSmartCollection(COLLECTION, rules);
  assert.deepEqual(result, { added: 2, removed: 2, total: 2 });
  const rows = db.__rows("collection_products").filter((row) => row.collection_id === COLLECTION).sort((a, b) => a.sort_order - b.sort_order);
  assert.deepEqual(rows.map((row) => row.product_id), ["p2", "p1"], "hidden p4 and expensive p3 are out, newest first");
});

test("sync: refuses rules that would match everything", async () => {
  await assert.rejects(syncSmartCollection(COLLECTION, cleanSmartRules({ enabled: true, criteria: {} })), /at least one rule/);
  assert.equal(db.__rows("collection_products").length, 2, "nothing was touched");
});

test("sync: markdown-only rule keeps products with a compare-at price above price", async () => {
  const result = await syncSmartCollection(COLLECTION, cleanSmartRules({ enabled: true, criteria: { onSale: true }, limit: 10 }));
  assert.equal(result.total, 1);
  assert.deepEqual(db.__rows("collection_products").filter((row) => row.collection_id === COLLECTION).map((row) => row.product_id), ["p2"]);
});

test("daily sync: only enabled collections are updated and the time is recorded", async () => {
  await saveSmartRules({
    [COLLECTION]: cleanSmartRules({ enabled: true, criteria: { maxPrice: 100 } }),
    "22222222-2222-4222-8222-222222222222": cleanSmartRules({ enabled: false, criteria: { maxPrice: 5 } }),
  });
  const outcome = await syncAllSmartCollections(NOW);
  assert.deepEqual(outcome, { synced: 1, errors: [] });
  const stored = db.__rows("admin_state").find((row) => row.key === "smart_collection_rules").value;
  assert.equal(stored[COLLECTION].lastSyncAt, new Date(NOW).toISOString());
  assert.equal(stored[COLLECTION].lastCount, 2);
  assert.equal(stored["22222222-2222-4222-8222-222222222222"].lastSyncAt, undefined);
});

test("daily sync: does nothing and does not fail when admin storage is missing", async () => {
  db.__reset();
  assert.deepEqual(await syncAllSmartCollections(NOW), { synced: 0, errors: [] });
});

test("saved views: only known, plausible parameters are kept", () => {
  assert.deepEqual(cleanFilterParams({ status: "classified", brand: "acme", stock: "sold_out", min: "5", max: "abc", evil: "x", brandx: "y", q: "  hoodie " }), { status: "classified", brand: "acme", stock: "sold_out", min: "5", q: "hoodie" });
  assert.deepEqual(cleanFilterParams({ brand: "Not A Slug!", stock: "weird" }), {});
});

test("saved views: names are required, same name replaces, the list is bounded", () => {
  let n = 0;
  const id = () => `id-${String(++n).padStart(6, "0")}`;
  assert.throws(() => withSavedFilter([], { name: " ", params: { q: "x" }, createdBy: "me" }), /name/);
  assert.throws(() => withSavedFilter([], { name: "Empty", params: {}, createdBy: "me" }), /at least one filter/);
  let list = withSavedFilter([], { name: "Sold out", params: { stock: "sold_out" }, createdBy: "me" }, new Date(NOW), id);
  list = withSavedFilter(list, { name: "sold OUT", params: { stock: "in_stock" }, createdBy: "me" }, new Date(NOW), id);
  assert.equal(list.length, 1);
  assert.equal(list[0].params.stock, "in_stock");
  assert.equal(filterHref(list[0]), "/admin/products?stock=in_stock");
  assert.deepEqual(withoutSavedFilter(list, list[0].id), []);
  let full = [];
  for (let i = 0; i < MAX_SAVED_FILTERS; i += 1) full = withSavedFilter(full, { name: `v${i}`, params: { q: `q${i}` }, createdBy: "me" }, new Date(NOW), id);
  assert.throws(() => withSavedFilter(full, { name: "one more", params: { q: "z" }, createdBy: "me" }, new Date(NOW), id), /up to/);
});

test("saved views: malformed stored data is ignored", () => {
  assert.deepEqual(sanitizeSavedFilters("nope"), []);
  assert.deepEqual(sanitizeSavedFilters([{ name: "", id: "abcdef" }, { name: "ok", id: "../../x" }, null, { name: "fine", id: "abcdef-12", params: { q: "a" } }]).map((f) => f.name), ["fine"]);
});
