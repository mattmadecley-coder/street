// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test from "node:test";
import assert from "node:assert/strict";
import { resolveRange, dayList, followersGained, publishedDay, statsFor, botStats } from "../lib/social-report.ts";

const TODAY = "2026-10-18";

test("presets resolve to the right windows and compare with the equal-length window before", () => {
  const t = resolveRange({ range: "today" }, TODAY);
  assert.deepEqual([t.from, t.to, t.prevFrom, t.prevTo, t.days], ["2026-10-18", "2026-10-18", "2026-10-17", "2026-10-17", 1]);
  const y = resolveRange({ range: "yesterday" }, TODAY);
  assert.deepEqual([y.from, y.to, y.prevFrom, y.includesToday], ["2026-10-17", "2026-10-17", "2026-10-16", false]);
  const w = resolveRange({ range: "7d" }, TODAY);
  assert.deepEqual([w.from, w.to, w.prevFrom, w.prevTo, w.days], ["2026-10-12", "2026-10-18", "2026-10-05", "2026-10-11", 7]);
  const m = resolveRange({ range: "30d" }, TODAY);
  assert.equal(m.days, 30);
  assert.equal(m.from, "2026-09-19");
});

test("custom range: swaps reversed dates, clamps the future, falls back on junk", () => {
  const c = resolveRange({ range: "custom", from: "2026-10-10", to: "2026-10-01" }, TODAY);
  assert.deepEqual([c.from, c.to, c.days], ["2026-10-01", "2026-10-10", 10]);
  const f = resolveRange({ range: "custom", from: "2026-10-10", to: "2030-01-01" }, TODAY);
  assert.equal(f.to, TODAY);
  const bad = resolveRange({ range: "custom", from: "nope", to: "also-nope" }, TODAY);
  assert.equal(bad.key, "7d");
  const huge = resolveRange({ range: "custom", from: "2020-01-01", to: "2026-10-18" }, TODAY);
  assert.equal(huge.days, 366);
  assert.equal(resolveRange({}, TODAY).key, "7d");
});

test("dayList is inclusive", () => {
  assert.deepEqual(dayList("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
});

test("followersGained uses the last reading before the window, else the first inside it", () => {
  const daily = [
    { day: "2026-10-10", platform: "instagram", metric: "followers", value: 100 },
    { day: "2026-10-14", platform: "instagram", metric: "followers", value: 110 },
    { day: "2026-10-16", platform: "instagram", metric: "followers", value: 130 },
  ];
  assert.deepEqual(followersGained(daily, "instagram", "2026-10-12", "2026-10-18"), { gained: 30, end: 130 });
  assert.deepEqual(followersGained(daily, "instagram", "2026-10-10", "2026-10-18"), { gained: 30, end: 130 }); // no earlier reading: starts from the first one in range
  assert.deepEqual(followersGained(daily, "tiktok", "2026-10-12", "2026-10-18"), { gained: null, end: null });
  assert.deepEqual(followersGained(daily, "instagram", "2026-11-01", "2026-11-02"), { gained: null, end: null });
});

test("publishedDay: Pinterest counts once its time has passed, others need status posted", () => {
  const now = Date.parse("2026-10-18T16:00:00Z");
  const pin = (over) => ({ platform: "pinterest", status: "scheduled", scheduled_for: "2026-10-18T12:00:00Z", posted_at: null, ...over });
  assert.equal(publishedDay(pin({}), now), "2026-10-18");
  assert.equal(publishedDay(pin({ scheduled_for: "2026-10-18T20:00:00Z" }), now), null);
  assert.equal(publishedDay({ platform: "tiktok", status: "scheduled", posted_at: "2026-10-18T12:00:00Z" }, now), null);
  assert.equal(publishedDay({ platform: "tiktok", status: "posted", posted_at: "2026-10-18T12:00:00Z" }, now), "2026-10-18");
});

test("statsFor rolls up posts, views and traffic for a channel inside the window only", () => {
  const empty = () => ({ tiktok: {}, instagram: {}, pinterest: {} });
  const traffic = { visits: [], clicks: [], visitors: empty(), sessions: empty(), outbound: empty() };
  traffic.sessions.tiktok = { "2026-10-17": 5, "2026-10-18": 7, "2026-10-01": 99 };
  traffic.outbound.tiktok = { "2026-10-18": 2 };
  const posts = [
    { platform: "tiktok", status: "posted", posted_at: "2026-10-18T14:00:00Z", views: 100, likes: 4 },
    { platform: "tiktok", status: "posted", posted_at: "2026-10-18T15:00:00Z", views: 50, likes: 1 },
    { platform: "tiktok", status: "posted", posted_at: "2026-10-01T15:00:00Z", views: 9999, likes: 9 },
    { platform: "instagram", status: "posted", posted_at: "2026-10-18T15:00:00Z", views: 1, likes: 1 },
  ];
  const s = statsFor("tiktok", "2026-10-17", "2026-10-18", { posts, daily: [], traffic });
  assert.deepEqual([s.posts, s.views, s.likes, s.visits, s.clicks, s.followersGained], [2, 150, 5, 12, 2, null]);
});

test("botStats sums activity in range and reads the latest following/followers", () => {
  const d = (day, metric, value) => ({ day, platform: "instagram", metric, value });
  const daily = [d("2026-10-16", "follows_made", 100), d("2026-10-17", "follows_made", 120), d("2026-10-17", "unfollows_made", 40), d("2026-10-12", "follows_made", 500),
    d("2026-10-17", "following", 1100), d("2026-10-18", "following", 1105), d("2026-10-18", "followers", 700)];
  assert.deepEqual(botStats(daily, "2026-10-16", "2026-10-18"), { followsMade: 220, unfollowsMade: 40, followBacks: 0, followingEnd: 1105, followersEnd: 700 });
});
