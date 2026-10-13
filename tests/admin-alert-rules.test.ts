// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAlertRules } from "../lib/admin-alert-rules.ts";
import { EMPTY_STATS } from "../lib/analytics-metrics.ts";

const NOW = Date.parse("2026-10-13T12:00:00Z");
const stats = (over = {}) => ({ ...EMPTY_STATS, ...over, handoffs: { ...EMPTY_STATS.handoffs, ...(over.handoffs ?? {}) } });
const base = (over = {}) => ({
  nowMs: NOW,
  latestEventAtMs: NOW - 60_000,
  current: stats({ sessions: 100, impressions: 1000, productClicks: 100, searches: 20, zeroResultSearches: 1, handoffs: { total: 20 } }),
  previous: stats({ sessions: 100, handoffs: { total: 20 } }),
  technicalErrors: 0,
  brokenImages: 0,
  staleBrandNames: [],
  ...over,
});
const titles = (alerts) => alerts.map((alert) => alert.title);

test("healthy store gives a single info alert", () => {
  const alerts = evaluateAlertRules(base());
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, "info");
});

test("analytics silent for more than 6 hours is critical; never-tracked is also critical", () => {
  assert.equal(evaluateAlertRules(base({ latestEventAtMs: NOW - 7 * 3600000 }))[0].severity, "critical");
  assert.equal(evaluateAlertRules(base({ latestEventAtMs: NOW - 5 * 3600000 }))[0].severity, "info");
  assert.match(evaluateAlertRules(base({ latestEventAtMs: 0 }))[0].detail, /No analytics events/);
});

test("traffic drop needs a meaningful baseline and a 40% fall", () => {
  const tiny = evaluateAlertRules(base({ previous: stats({ sessions: 9 }), current: stats({ sessions: 1 }) }));
  assert.ok(!titles(tiny).includes("Traffic dropped sharply"));
  const real = evaluateAlertRules(base({ previous: stats({ sessions: 100 }), current: stats({ sessions: 59, impressions: 0 }) }));
  assert.ok(titles(real).includes("Traffic dropped sharply"));
  const mild = evaluateAlertRules(base({ previous: stats({ sessions: 100 }), current: stats({ sessions: 61 }) }));
  assert.ok(!titles(mild).includes("Traffic dropped sharply"));
});

test("outbound drop compares the de-duplicated hand-off totals", () => {
  const alerts = evaluateAlertRules(base({ previous: stats({ sessions: 100, handoffs: { total: 10 } }), current: stats({ sessions: 100, handoffs: { total: 4 } }) }));
  assert.ok(titles(alerts).includes("Outbound traffic dropped"));
});

test("technical errors: 3 is a warning, 10 is critical", () => {
  assert.equal(evaluateAlertRules(base({ technicalErrors: 2 })).some((a) => /Technical errors/.test(a.title)), false);
  assert.equal(evaluateAlertRules(base({ technicalErrors: 3 })).find((a) => /Technical errors/.test(a.title)).severity, "warning");
  assert.equal(evaluateAlertRules(base({ technicalErrors: 10 })).find((a) => /Technical errors/.test(a.title)).severity, "critical");
});

test("broken images: 5 is a warning, 20 is critical, and both link to Brands", () => {
  const warn = evaluateAlertRules(base({ brokenImages: 5 })).find((a) => /images/.test(a.title));
  const crit = evaluateAlertRules(base({ brokenImages: 20 })).find((a) => /images/.test(a.title));
  assert.equal(warn.severity, "warning");
  assert.equal(crit.severity, "critical");
  assert.equal(crit.href, "/admin/brands");
});

test("weak CTR and zero-result searches only fire with enough volume", () => {
  const lowVolume = evaluateAlertRules(base({ current: stats({ sessions: 100, impressions: 50, productClicks: 0, searches: 5, zeroResultSearches: 5 }) }));
  assert.equal(lowVolume.length, 1);
  const weak = evaluateAlertRules(base({ current: stats({ sessions: 100, impressions: 200, productClicks: 2, searches: 10, zeroResultSearches: 3 }) }));
  assert.ok(titles(weak).includes("Product CTR is weak"));
  assert.ok(titles(weak).includes("Too many searches return nothing"));
});

test("stale brands: 1-4 is a warning, 5 or more is critical, names are listed", () => {
  const few = evaluateAlertRules(base({ staleBrandNames: ["A", "B"] })).find((a) => /not synced/.test(a.title));
  assert.equal(few.severity, "warning");
  assert.match(few.detail, /A, B/);
  const many = evaluateAlertRules(base({ staleBrandNames: ["1", "2", "3", "4", "5"] })).find((a) => /not synced/.test(a.title));
  assert.equal(many.severity, "critical");
});

test("alerts are sorted critical, then warning, then info; every actionable alert has a link", () => {
  const alerts = evaluateAlertRules(base({ technicalErrors: 3, brokenImages: 25, staleBrandNames: ["A"] }));
  const order = alerts.map((a) => a.severity);
  assert.deepEqual(order, [...order].sort((a, b) => ({ critical: 0, warning: 1, info: 2 })[a] - ({ critical: 0, warning: 1, info: 2 })[b]));
  for (const alert of alerts) assert.ok(alert.href, `${alert.title} needs a link`);
});
