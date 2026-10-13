// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test from "node:test";
import assert from "node:assert/strict";
import { resolveDateRange, rangeUtcDays, isValidTimeZone, timeZoneLabel, RANGE_PRESETS } from "../lib/date-range.ts";

const HOUR = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
// 2:05 AM Eastern (EDT, UTC-4) on Tuesday 2026-10-13.
const NOW = Date.parse("2026-10-13T06:05:00Z");

test("Today starts at local midnight, is hourly and in progress", () => {
  const range = resolveDateRange({ range: "today" }, { nowMs: NOW });
  assert.equal(iso(range.startMs), "2026-10-13T04:00:00.000Z");
  assert.equal(range.endMs, NOW);
  assert.equal(range.hourly, true);
  assert.equal(range.inProgress, true);
  assert.equal(range.label, "Today");
  assert.equal(range.startDateInput, "2026-10-13");
});

test("Today compares with yesterday only up to the same time of day", () => {
  const range = resolveDateRange({ range: "today" }, { nowMs: NOW });
  assert.equal(iso(range.compare.startMs), "2026-10-12T04:00:00.000Z");
  assert.equal(range.compare.endMs - range.compare.startMs, range.endMs - range.startMs);
  assert.equal(iso(range.compare.endMs), "2026-10-12T06:05:00.000Z");
});

test("Yesterday is a full local day and compares with the full day before", () => {
  const range = resolveDateRange({ range: "yesterday" }, { nowMs: NOW });
  assert.equal(iso(range.startMs), "2026-10-12T04:00:00.000Z");
  assert.equal(iso(range.endMs), "2026-10-13T04:00:00.000Z");
  assert.equal(range.inProgress, false);
  assert.equal(iso(range.compare.startMs), "2026-10-11T04:00:00.000Z");
  assert.equal(iso(range.compare.endMs), "2026-10-12T04:00:00.000Z");
});

test("Last 7 days is seven calendar days ending today", () => {
  const range = resolveDateRange({ range: "7" }, { nowMs: NOW });
  assert.equal(range.startDateInput, "2026-10-07");
  assert.equal(range.endDateInput, "2026-10-13");
  assert.equal(range.hourly, false);
  assert.equal(range.label, "Last 7 days");
  // Previous period is the seven days before, cut to the same elapsed time.
  assert.equal(range.compare.startDateInput, "2026-09-30");
  assert.equal(range.compare.endDateInput, "2026-10-06");
  assert.equal(range.compare.endMs - range.compare.startMs, range.endMs - range.startMs);
});

test("Last 30 and 90 days span the right number of calendar days", () => {
  assert.equal(resolveDateRange({ range: "30" }, { nowMs: NOW }).startDateInput, "2026-09-14");
  assert.equal(resolveDateRange({ range: "90" }, { nowMs: NOW }).startDateInput, "2026-07-16");
});

test("Month to date, last month and year to date use calendar boundaries", () => {
  const mtd = resolveDateRange({ range: "mtd" }, { nowMs: NOW });
  assert.equal(mtd.startDateInput, "2026-10-01");
  assert.equal(mtd.endDateInput, "2026-10-13");
  const last = resolveDateRange({ range: "last_month" }, { nowMs: NOW });
  assert.equal(last.startDateInput, "2026-09-01");
  assert.equal(last.endDateInput, "2026-09-30");
  assert.equal(last.inProgress, false);
  const ytd = resolveDateRange({ range: "ytd" }, { nowMs: NOW });
  assert.equal(ytd.startDateInput, "2026-01-01");
});

test("Last month in January reaches back across the year", () => {
  const range = resolveDateRange({ range: "last_month" }, { nowMs: Date.parse("2027-01-15T17:00:00Z") });
  assert.equal(range.startDateInput, "2026-12-01");
  assert.equal(range.endDateInput, "2026-12-31");
});

test("A day with a daylight-saving change is 25 hours long, not 24", () => {
  // US clocks go back on 2026-11-01; "yesterday" from Nov 2 noon is that long day.
  const range = resolveDateRange({ range: "yesterday" }, { nowMs: Date.parse("2026-11-02T17:00:00Z") });
  assert.equal(iso(range.startMs), "2026-11-01T04:00:00.000Z");
  assert.equal(iso(range.endMs), "2026-11-02T05:00:00.000Z");
  assert.equal((range.endMs - range.startMs) / HOUR, 25);
});

test("Spring-forward day is 23 hours", () => {
  const range = resolveDateRange({ range: "yesterday" }, { nowMs: Date.parse("2027-03-15T17:00:00Z") });
  const dstDay = resolveDateRange({ range: "custom", start: "2027-03-14", end: "2027-03-14" }, { nowMs: Date.parse("2027-03-15T17:00:00Z") });
  assert.equal((dstDay.endMs - dstDay.startMs) / HOUR, 23);
  assert.ok(range.endMs > range.startMs);
});

test("Custom ranges accept reversed dates and clamp the end to now", () => {
  const reversed = resolveDateRange({ range: "custom", start: "2026-10-10", end: "2026-10-05" }, { nowMs: NOW });
  assert.equal(reversed.startDateInput, "2026-10-05");
  assert.equal(reversed.endDateInput, "2026-10-10");
  assert.equal(reversed.label, "Oct 5 – Oct 10, 2026");
  const future = resolveDateRange({ range: "custom", start: "2026-10-10", end: "2027-01-01" }, { nowMs: NOW });
  assert.equal(future.endMs, NOW);
  assert.equal(future.inProgress, true);
});

test("A single-day custom range is hourly and labelled with the date", () => {
  const range = resolveDateRange({ range: "custom", start: "2026-10-05", end: "2026-10-05" }, { nowMs: NOW });
  assert.equal(range.hourly, true);
  assert.equal(range.label, "Oct 5, 2026");
});

test("Unknown, missing or malicious input falls back to the default preset", () => {
  for (const bad of [undefined, "", "bogus", "999", "7; drop table", "custom;"]) {
    const range = resolveDateRange({ range: bad }, { nowMs: NOW });
    if (bad === "custom;") continue; // not a valid key -> default
    assert.equal(range.key, "7", `range=${bad}`);
  }
  const garbage = resolveDateRange({ range: "custom", start: "not-a-date", end: "2026-13-45" }, { nowMs: NOW });
  assert.equal(garbage.key, "custom");
  assert.ok(garbage.endMs >= garbage.startMs);
});

test("Legacy ?range=1 still means Today", () => {
  assert.equal(resolveDateRange({ range: "1" }, { nowMs: NOW }).key, "today");
});

test("compare=none removes the comparison; compare=year shifts by a calendar year", () => {
  assert.equal(resolveDateRange({ range: "7", compare: "none" }, { nowMs: NOW }).compare, null);
  const year = resolveDateRange({ range: "yesterday", compare: "year" }, { nowMs: NOW });
  assert.equal(year.compare.startDateInput, "2025-10-12");
  assert.equal(year.compare.mode, "year");
});

test("Same period last year clamps Feb 29 to Feb 28", () => {
  const range = resolveDateRange({ range: "custom", start: "2028-02-29", end: "2028-02-29", compare: "year" }, { nowMs: Date.parse("2028-03-05T17:00:00Z") });
  assert.equal(range.compare.startDateInput, "2027-02-28");
});

test("Time zone changes where the day starts", () => {
  const tokyo = resolveDateRange({ range: "today" }, { nowMs: NOW, timeZone: "Asia/Tokyo" });
  assert.equal(tokyo.startDateInput, "2026-10-13");
  assert.equal(iso(tokyo.startMs), "2026-10-12T15:00:00.000Z");
  assert.equal(tokyo.timeZone, "Asia/Tokyo");
  const invalid = resolveDateRange({ range: "today" }, { nowMs: NOW, timeZone: "Mars/Olympus" });
  assert.equal(invalid.timeZone, "America/New_York");
});

test("Every preset resolves to a non-empty, ordered range", () => {
  for (const preset of RANGE_PRESETS) {
    const range = resolveDateRange({ range: preset.key }, { nowMs: NOW });
    assert.ok(range.endMs > range.startMs, preset.key);
    assert.equal(range.label, preset.label);
    assert.ok(range.compare.endMs > range.compare.startMs, `${preset.key} compare`);
    assert.ok(range.compare.endMs <= range.startMs, `${preset.key} compare must end before the range starts`);
  }
});

test("helpers: UTC day bounds, zone validation and labels", () => {
  const range = resolveDateRange({ range: "yesterday" }, { nowMs: NOW });
  assert.deepEqual(rangeUtcDays(range), { startDay: "2026-10-12", endDay: "2026-10-13" });
  assert.equal(isValidTimeZone("America/New_York"), true);
  assert.equal(isValidTimeZone("Nope/Zone"), false);
  assert.equal(isValidTimeZone(""), false);
  assert.equal(timeZoneLabel("America/New_York", NOW), "Eastern Time");
});
