// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test from "node:test";
import assert from "node:assert/strict";
import { buildWindowStats, dedupeHandoffs, inWindow, EMPTY_STATS, DEDUPE_WINDOW_MS } from "../lib/analytics-metrics.ts";

const T0 = Date.parse("2026-10-10T15:00:00Z");
const at = (minutes, seconds = 0) => new Date(T0 + minutes * 60_000 + seconds * 1000).toISOString();

function event(type, visitor, session, minutes, extra = {}) {
  return {
    event_type: type, anonymous_user_id: visitor, session_id: session, query: null, results_count: null, product_id: null,
    brand_slug: "acme", street_group: null, street_category: null, price: null, path: "/", referrer: null, source_component: null,
    position: null, device_type: "desktop", browser: "Chrome", operating_system: "Windows", screen_width: 1440, language: "en",
    timezone: null, landing_path: "/", utm_source: null, utm_medium: null, utm_campaign: null, metadata: {}, created_at: at(minutes), ...extra,
  };
}
function click(visitor, session, minutes, productSlug = null, extra = {}) {
  return {
    product_id: null, brand_slug: "acme", product_slug: productSlug, product_title: productSlug, product_price: productSlug ? 100 : null,
    destination_url: "https://acme.example/x", anonymous_user_id: visitor, session_id: session, source_component: null, source_path: "/",
    search_query: null, position: null, referrer: null, utm_source: null, utm_medium: null, utm_campaign: null, created_at: at(minutes), ...extra,
  };
}

test("repeat hand-offs within 30 minutes count once; after 30 minutes they count again", () => {
  const items = [
    { key: "v1::p1", at: T0, kind: "product", visitor: "v1" },
    { key: "v1::p1", at: T0 + 10 * 60_000, kind: "product", visitor: "v1" },
    { key: "v1::p1", at: T0 + 10 * 60_000 + DEDUPE_WINDOW_MS, kind: "product", visitor: "v1" },
    { key: "v1::p2", at: T0 + 11 * 60_000, kind: "product", visitor: "v1" },
  ];
  assert.equal(dedupeHandoffs(items).length, 3);
});

test("brand visits, product visits and checkout clicks are separate; bag adds are not hand-offs", () => {
  const events = [
    event("page_view", "v1", "s1", 0), event("product_view", "v1", "s1", 1), event("add_to_cart", "v1", "s1", 2),
    event("cart_checkout_click", "v1", "s1", 3),
  ];
  const clicks = [click("v1", "s1", 4, "acme--tee"), click("v1", "s1", 5, null)];
  const stats = buildWindowStats(events, clicks);
  assert.equal(stats.handoffs.productVisits, 1);
  assert.equal(stats.handoffs.brandVisits, 1);
  assert.equal(stats.handoffs.checkoutClicks, 1);
  assert.equal(stats.handoffs.total, 3);
  assert.equal(stats.handoffs.highIntent, 2);
  assert.equal(stats.bagAdds, 1);
  assert.equal(stats.shoppers, 1);
});

test("duplicate clicks are removed from the headline but kept in rawTotal", () => {
  const events = [event("page_view", "v1", "s1", 0), event("product_view", "v1", "s1", 1)];
  const clicks = [click("v1", "s1", 2, "acme--tee"), click("v1", "s1", 3, "acme--tee"), click("v1", "s1", 4, "acme--tee")];
  const stats = buildWindowStats(events, clicks);
  assert.equal(stats.handoffs.total, 1);
  assert.equal(stats.handoffs.rawTotal, 3);
});

test("bounce rate counts quick single-page visits that the likely-human filter drops", () => {
  const events = [
    event("page_view", "bounce", "sb", 0), // one page, nothing else, seconds long
    event("page_view", "keeper", "sk", 0), event("product_view", "keeper", "sk", 1),
  ];
  const stats = buildWindowStats(events, []);
  assert.equal(stats.bounceRate, 0.5);
  // The bounced visitor is not a "likely human" visitor, so headline visitors only count the engaged one.
  assert.equal(stats.visitors, 1);
  assert.equal(stats.recordedVisitors, 2);
});

test("a second page view or any interaction is not a bounce", () => {
  const events = [
    event("page_view", "a", "sa", 0), event("page_view", "a", "sa", 1),
    event("page_view", "b", "sb", 0), event("search", "b", "sb", 1, { query: "hoodie", results_count: 3 }),
  ];
  assert.equal(buildWindowStats(events, []).bounceRate, 0);
});

test("suspected automated visitors never count toward bounce rate", () => {
  const events = [
    event("page_view", "bot", "s-bot", 0, { operating_system: "iOS", screen_width: 1920 }), // impossible device
    event("page_view", "human", "s-human", 0), event("page_view", "human", "s-human", 1),
  ];
  const stats = buildWindowStats(events, []);
  assert.equal(stats.bounceRate, 0);
});

test("with no traffic every number is zero and bounce rate is unknown, not 0%", () => {
  const stats = buildWindowStats([], []);
  assert.deepEqual(stats, EMPTY_STATS);
  assert.equal(stats.bounceRate, null);
});

test("zero-result searches and impressions are counted for human visitors only", () => {
  const events = [
    event("page_view", "h", "s", 0), event("page_view", "h", "s", 1),
    event("search", "h", "s", 2, { query: "x", results_count: 0 }), event("search", "h", "s", 3, { query: "y", results_count: 5 }),
    event("product_impression", "h", "s", 4),
  ];
  const stats = buildWindowStats(events, []);
  assert.equal(stats.searches, 2);
  assert.equal(stats.zeroResultSearches, 1);
  assert.equal(stats.impressions, 1);
});

test("inWindow keeps rows inside [start, end) only", () => {
  const rows = [{ created_at: at(0) }, { created_at: at(10) }, { created_at: at(20) }];
  assert.equal(inWindow(rows, T0 + 10 * 60_000, T0 + 20 * 60_000).length, 1);
});
