// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test from "node:test";
import assert from "node:assert/strict";
import { cleanBrandMeta, sanitizeStoredMeta, withBrandMeta, EMPTY_META, MAX_BRAND_META } from "../lib/brand-meta.ts";
import { filterBrands, matchesQuery, needsAttention, isBrandFilter } from "../lib/brand-filters.ts";

const NOW = Date.parse("2026-10-13T12:00:00Z");
const DAY = 86_400_000;
const brand = (slug, over = {}) => ({ slug, name: slug.replace(/-/g, " "), logoUrl: "x.png", catalogEnabled: true, storefrontStatus: "open", progressState: "finished", lastSuccessAt: new Date(NOW - DAY).toISOString(), ...over });

test("brand record: input is trimmed, clamped and validated", () => {
  const meta = cleanBrandMeta({ permission: "granted", source: "  email   from   Sam ", date: "2026-10-01", notes: "  ok\r\nthanks  " });
  assert.deepEqual(meta, { permission: "granted", source: "email from Sam", date: "2026-10-01", notes: "ok\nthanks" });
  assert.equal(cleanBrandMeta({ permission: "root", date: "2026-02-31" }).permission, "none");
  assert.equal(cleanBrandMeta({ date: "2026-02-31" }).date, "", "impossible dates are dropped");
  assert.equal(cleanBrandMeta({ date: "yesterday" }).date, "");
  assert.equal(cleanBrandMeta({ notes: "x".repeat(5000) }).notes.length, 1000);
  assert.equal(cleanBrandMeta({ source: "y".repeat(500) }).source.length, 120);
  assert.deepEqual(cleanBrandMeta({}), EMPTY_META);
});

test("brand records: only valid slugs and well-formed entries survive loading", () => {
  const stored = { "good-brand": { permission: "granted", source: "x" }, "Bad Slug!": { permission: "granted" }, "../etc": { permission: "granted" }, ok2: null, ok3: "str" };
  assert.deepEqual(Object.keys(sanitizeStoredMeta(stored)), ["good-brand"]);
  assert.deepEqual(sanitizeStoredMeta(null), {});
  assert.deepEqual(sanitizeStoredMeta([1, 2]), {});
});

test("brand records: setting an empty record removes the entry; bad slugs are refused", () => {
  const full = withBrandMeta({}, "acme", cleanBrandMeta({ permission: "requested" }));
  assert.equal(full.acme.permission, "requested");
  assert.deepEqual(withBrandMeta(full, "acme", EMPTY_META), {});
  assert.throws(() => withBrandMeta({}, "Not A Slug", EMPTY_META), /Invalid brand/);
  const big = {};
  for (let i = 0; i < MAX_BRAND_META; i += 1) big[`b${i}`] = cleanBrandMeta({ permission: "granted" });
  assert.throws(() => withBrandMeta(big, "one-more", cleanBrandMeta({ permission: "granted" })), /Too many/);
});

test("search: every word must match the name or slug, in any order and case", () => {
  assert.equal(matchesQuery({ name: "Broken Planet", slug: "broken-planet" }, "planet broken"), true);
  assert.equal(matchesQuery({ name: "Broken Planet", slug: "broken-planet" }, "BROK"), true);
  assert.equal(matchesQuery({ name: "Broken Planet", slug: "broken-planet" }, "broken market"), false);
  assert.equal(matchesQuery({ name: "A", slug: "a" }, "   "), true);
});

test("needs attention: failed import, no logo, or a stale sync", () => {
  assert.equal(needsAttention(brand("fine"), NOW), false);
  assert.equal(needsAttention(brand("failed", { progressState: "failed" }), NOW), true);
  assert.equal(needsAttention(brand("nologo", { logoUrl: null }), NOW), true);
  assert.equal(needsAttention(brand("stale", { lastSuccessAt: new Date(NOW - 5 * DAY).toISOString() }), NOW), true);
  assert.equal(needsAttention(brand("never", { lastSuccessAt: null }), NOW), true);
  assert.equal(needsAttention(brand("closed-store", { storefrontStatus: "closed", lastSuccessAt: null }), NOW), false, "a closed store is an expected skip, not staleness");
  assert.equal(needsAttention(brand("paused", { catalogEnabled: false, lastSuccessAt: null }), NOW), false);
});

test("filters pick exactly the right brands", () => {
  const items = [brand("a"), brand("b", { logoUrl: null }), brand("c", { catalogEnabled: false }), brand("d", { storefrontStatus: "closed" }), brand("e")];
  const meta = { a: { permission: "granted" }, b: { permission: "requested" }, c: { permission: "declined" } };
  const slugs = (filter, query = "") => filterBrands(items, filter, query, meta, NOW).map((item) => item.slug);
  assert.deepEqual(slugs("all"), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(slugs("no-logo"), ["b"]);
  assert.deepEqual(slugs("paused"), ["c"]);
  assert.deepEqual(slugs("closed"), ["d"]);
  assert.deepEqual(slugs("no-permission"), ["d", "e"]);
  assert.deepEqual(slugs("asked"), ["b"]);
  assert.deepEqual(slugs("declined"), ["c"]);
  assert.deepEqual(slugs("attention"), ["b"]);
  assert.deepEqual(slugs("all", "c"), ["c"]);
  assert.deepEqual(slugs("no-permission", "e"), ["e"]);
});

test("filter names are validated", () => {
  assert.equal(isBrandFilter("attention"), true);
  assert.equal(isBrandFilter("everything"), false);
  assert.equal(isBrandFilter(undefined), false);
});
