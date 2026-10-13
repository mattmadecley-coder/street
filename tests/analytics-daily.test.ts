// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as db from "./fakes/supabase-rest.ts";
import { snapshotFromRows, fillTrendFromSnapshots, dayWindow, computeMissingSnapshots, loadDailySnapshots } from "../lib/analytics-daily.ts";

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-13T15:00:00Z"); // Oct 13, 11:00 in New York

const pv = (visitor, session, iso, extra = {}) => ({ event_type: "page_view", anonymous_user_id: visitor, session_id: session, created_at: iso, excluded: false, ...extra });
const click = (visitor, session, iso, price = 40) => ({ anonymous_user_id: visitor, session_id: session, created_at: iso, excluded: false, brand_slug: "acme", product_slug: "acme--tee", product_price: price, destination_url: "https://acme.test/tee", source_component: "product_page" });

beforeEach(() => db.__reset());

test("day window follows the reporting time zone", () => {
  const w = dayWindow("2026-10-12", TZ);
  assert.equal(new Date(w.startMs).toISOString(), "2026-10-12T04:00:00.000Z");
  assert.equal(new Date(w.endMs).toISOString(), "2026-10-13T04:00:00.000Z");
  assert.equal(dayWindow("not-a-day", TZ), null);
  const winter = dayWindow("2026-12-01", TZ);
  assert.equal(new Date(winter.startMs).toISOString(), "2026-12-01T05:00:00.000Z");
});

test("snapshot counts only that day's people, sessions and clicks", () => {
  const events = [
    pv("v1", "s1", "2026-10-12T15:00:00Z"), pv("v1", "s1", "2026-10-12T15:01:00Z", { event_type: "product_view" }),
    pv("v2", "s2", "2026-10-12T16:00:00Z"), pv("v2", "s2", "2026-10-12T16:02:00Z", { event_type: "search", query: "hoodie", results_count: 3 }),
    pv("v3", "s3", "2026-10-11T15:00:00Z"), // a different day
  ];
  const snapshot = snapshotFromRows("2026-10-12", events, [click("v1", "s1", "2026-10-12T15:03:00Z"), click("v3", "s3", "2026-10-11T15:03:00Z")], TZ);
  assert.equal(snapshot.day, "2026-10-12");
  assert.equal(snapshot.outboundClicks, 1);
  assert.ok(snapshot.visitors <= snapshot.recordedVisitors);
  assert.equal(snapshot.recordedVisitors, 2);
  assert.equal(snapshot.intentValue, 40);
  assert.equal(snapshotFromRows("garbage", events, [], TZ), null);
});

const trend = (days) => days.map((key) => ({ key, label: key.slice(5), visitors: 1, recordedVisitors: 1, sessions: 1, outboundClicks: 0, intentValue: 0 }));
const snap = (day, visitors) => ({ day, visitors, recordedVisitors: visitors, sessions: visitors, outboundClicks: 2, intentValue: 10 });

test("chart fill: days before the oldest loaded event use the stored summary; later days are left alone", () => {
  const points = trend(["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
  const oldest = Date.parse("2026-10-10T20:00:00Z"); // part way through Oct 10 (NY)
  const { points: out, filled } = fillTrendFromSnapshots(points, [snap("2026-10-08", 50), snap("2026-10-10", 70), snap("2026-10-11", 99)], oldest, TZ);
  assert.equal(filled, 2, "Oct 8 and the partly loaded Oct 10");
  assert.deepEqual(out.map((p) => p.visitors), [50, 1, 70, 1], "Oct 9 has no summary, Oct 11 was fully loaded");
  assert.equal(out[0].outboundClicks, 2);
});

test("chart fill: nothing changes without summaries or without a loaded-events marker", () => {
  const points = trend(["2026-10-08"]);
  assert.equal(fillTrendFromSnapshots(points, [], 1, TZ).points, points);
  assert.equal(fillTrendFromSnapshots(points, [snap("2026-10-08", 9)], null, TZ).filled, 0);
});

function seedEvents() {
  db.__table("site_events", [
    pv("v1", "s1", "2026-10-10T15:00:00Z"), pv("v1", "s1", "2026-10-10T15:02:00Z", { event_type: "product_view" }),
    pv("v2", "s2", "2026-10-11T15:00:00Z"), pv("v2", "s2", "2026-10-11T15:01:00Z", { event_type: "product_view" }),
    pv("v3", "s3", "2026-10-13T14:00:00Z"), // today: never stored
  ]);
  db.__table("outbound_clicks", [click("v1", "s1", "2026-10-10T15:05:00Z")]);
}

test("roll-up job: stores completed days only, oldest first, and respects the per-run limit", async () => {
  seedEvents();
  db.__table("analytics_daily");
  const earliest = Date.parse("2026-10-10T15:00:00Z");
  const first = await computeMissingSnapshots(TZ, NOW, 2, earliest);
  assert.deepEqual(first.computed, ["2026-10-10", "2026-10-11"]);
  assert.equal(first.remaining, 1, "Oct 12 still to do");
  const second = await computeMissingSnapshots(TZ, NOW, 5, earliest);
  assert.deepEqual(second.computed, ["2026-10-12"]);
  assert.equal(second.remaining, 0);
  const third = await computeMissingSnapshots(TZ, NOW, 5, earliest);
  assert.deepEqual(third.computed, [], "nothing left; today is never stored");
  const rows = db.__rows("analytics_daily");
  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row.day === "2026-10-10").outbound_clicks, 1);
  assert.equal(rows.find((row) => row.day === "2026-10-12").visitors, 0, "a quiet day is stored as zeros");
  const loaded = await loadDailySnapshots(TZ, "2026-10-10", "2026-10-12");
  assert.equal(loaded.available, true);
  assert.deepEqual(loaded.snapshots.map((s) => s.day), ["2026-10-10", "2026-10-11", "2026-10-12"]);
});

test("roll-up job: reports 'not available' instead of failing when the table is missing", async () => {
  seedEvents();
  const result = await computeMissingSnapshots(TZ, NOW, 5, Date.parse("2026-10-10T15:00:00Z"));
  assert.deepEqual(result, { computed: [], available: false, remaining: 0 });
  assert.deepEqual(await loadDailySnapshots(TZ, "2026-10-10", "2026-10-12"), { snapshots: [], available: false });
});

test("roll-up job: no tracked events means nothing to do", async () => {
  db.__table("analytics_daily");
  assert.deepEqual((await computeMissingSnapshots(TZ, NOW, 5, null)).computed, []);
});
