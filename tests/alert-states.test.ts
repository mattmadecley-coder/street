// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test from "node:test";
import assert from "node:assert/strict";
import { acknowledge, snooze, restore, splitAlerts, isAlertSilenced, pruneStates } from "../lib/alert-states.ts";
import { normalizeThresholds, DEFAULT_ALERT_THRESHOLDS } from "../lib/alert-thresholds.ts";
import { evaluateAlertRules, ALERT_RULE_KEYS } from "../lib/admin-alert-rules.ts";
import { EMPTY_STATS } from "../lib/analytics-metrics.ts";

const NOW = Date.parse("2026-10-13T12:00:00Z");
const DAY = 86_400_000;
const warn = { key: "broken-images", severity: "warning", title: "t", detail: "d" };
const crit = { ...warn, severity: "critical" };

test("acknowledging silences an alert until it gets more severe", () => {
  const states = acknowledge({}, warn, NOW);
  assert.ok(isAlertSilenced(warn, states, NOW + 30 * DAY));
  assert.equal(isAlertSilenced(crit, states, NOW), null);
});

test("a snooze expires, and expired snoozes are pruned", () => {
  const states = snooze({}, warn, 1, NOW);
  assert.ok(isAlertSilenced(warn, states, NOW + DAY - 1));
  assert.equal(isAlertSilenced(warn, states, NOW + DAY + 1), null);
  assert.deepEqual(pruneStates(states, NOW + 2 * DAY), {});
});

test("snooze length is clamped to 1-30 days", () => {
  const long = snooze({}, warn, 9999, NOW);
  assert.equal(new Date(long["broken-images"].until).getTime(), NOW + 30 * DAY);
  const tiny = snooze({}, warn, 0, NOW);
  assert.equal(new Date(tiny["broken-images"].until).getTime(), NOW + DAY);
});

test("restore brings an alert back; splitAlerts separates active from silenced", () => {
  const other = { key: "weak-ctr", severity: "warning", title: "x", detail: "y" };
  let states = acknowledge({}, warn, NOW);
  let { active, silenced } = splitAlerts([warn, other], states, NOW);
  assert.deepEqual(active.map((a) => a.key), ["weak-ctr"]);
  assert.deepEqual(silenced.map((s) => s.alert.key), ["broken-images"]);
  states = restore(states, "broken-images");
  ({ active, silenced } = splitAlerts([warn, other], states, NOW));
  assert.equal(active.length, 2);
  assert.equal(silenced.length, 0);
});

test("info notices can never be silenced", () => {
  const info = { key: "all-clear", severity: "info", title: "", detail: "" };
  assert.equal(isAlertSilenced(info, { "all-clear": { status: "acknowledged", until: null, severity: "info", at: "" } }, NOW), null);
});

test("thresholds: defaults, valid overrides, and garbage input", () => {
  assert.deepEqual(normalizeThresholds(undefined), DEFAULT_ALERT_THRESHOLDS);
  assert.equal(normalizeThresholds({ silenceHours: 12 }).silenceHours, 12);
  assert.equal(normalizeThresholds({ silenceHours: "24" }).silenceHours, 24);
  assert.equal(normalizeThresholds({ silenceHours: -5 }).silenceHours, DEFAULT_ALERT_THRESHOLDS.silenceHours);
  assert.equal(normalizeThresholds({ silenceHours: "abc" }).silenceHours, DEFAULT_ALERT_THRESHOLDS.silenceHours);
  assert.equal(normalizeThresholds({ silenceHours: 99999 }).silenceHours, DEFAULT_ALERT_THRESHOLDS.silenceHours);
  assert.equal(normalizeThresholds("nonsense").staleSyncDays, DEFAULT_ALERT_THRESHOLDS.staleSyncDays);
});

test("a critical threshold can never sit below its warning threshold", () => {
  const fixed = normalizeThresholds({ errorsWarning: 20, errorsCritical: 5 });
  assert.equal(fixed.errorsCritical, 20);
  const images = normalizeThresholds({ brokenImagesWarning: 50, brokenImagesCritical: 10 });
  assert.equal(images.brokenImagesCritical, 50);
});

test("custom thresholds change when rules fire", () => {
  const input = { nowMs: NOW, latestEventAtMs: NOW - 60_000, current: { ...EMPTY_STATS }, previous: { ...EMPTY_STATS }, technicalErrors: 4, brokenImages: 0, staleBrandNames: [] };
  assert.ok(evaluateAlertRules(input).some((a) => a.key === "technical-errors"));
  const relaxed = normalizeThresholds({ errorsWarning: 50, errorsCritical: 100 });
  assert.ok(!evaluateAlertRules(input, relaxed).some((a) => a.key === "technical-errors"));
});

test("every rule key the engine emits is in the allow-list used to validate form posts", () => {
  const input = {
    nowMs: NOW, latestEventAtMs: 0,
    current: { ...EMPTY_STATS, sessions: 1, impressions: 500, productClicks: 1, searches: 50, zeroResultSearches: 50, handoffs: { ...EMPTY_STATS.handoffs, total: 0 } },
    previous: { ...EMPTY_STATS, sessions: 100, handoffs: { ...EMPTY_STATS.handoffs, total: 50 } },
    technicalErrors: 50, brokenImages: 50, staleBrandNames: ["A"],
  };
  for (const alert of evaluateAlertRules(input)) assert.ok(ALERT_RULE_KEYS.includes(alert.key), alert.key);
});
