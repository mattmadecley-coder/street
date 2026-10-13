// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test from "node:test";
import assert from "node:assert/strict";
import { recordReplaced, sanitizeHistory, snapshotsEqual, MAX_HOMEPAGE_VERSIONS } from "../lib/homepage-history.ts";

const snap = (n, over = {}) => ({ hero_image_url: `https://x/${n}.jpg`, hero_video_url: "", featured_brand_slug: `brand-${n}`, featured_brand_cta_label: "Shop", ...over });

test("saving identical settings records nothing", () => {
  const history = recordReplaced([], snap(1), snap(1), "me", "2026-10-13T10:00:00Z");
  assert.deepEqual(history, []);
});

test("replacing settings records what was live, newest first", () => {
  let history = recordReplaced([], snap(1), snap(2), "owner@x.com", "2026-10-13T10:00:00Z");
  history = recordReplaced(history, snap(2), snap(3), "shared password", "2026-10-13T11:00:00Z");
  assert.equal(history.length, 2);
  assert.equal(history[0].settings.featured_brand_slug, "brand-2");
  assert.equal(history[0].by, "shared password");
  assert.equal(history[1].settings.featured_brand_slug, "brand-1");
});

test("history is capped", () => {
  let history = [];
  for (let i = 0; i < MAX_HOMEPAGE_VERSIONS + 10; i += 1) history = recordReplaced(history, snap(i), snap(i + 1), "me", `2026-10-13T10:${String(i % 60).padStart(2, "0")}:00Z`);
  assert.equal(history.length, MAX_HOMEPAGE_VERSIONS);
});

test("equality ignores missing vs empty fields", () => {
  assert.equal(snapshotsEqual(snap(1, { hero_video_url: "" }), { ...snap(1), hero_video_url: undefined }), true);
  assert.equal(snapshotsEqual(snap(1), snap(2)), false);
});

test("stored history: malformed entries are dropped and the rest are sorted newest first", () => {
  const stored = {
    items: [
      { at: "2026-10-01T00:00:00Z", by: "a", settings: snap(1) },
      { at: "2026-10-05T00:00:00Z", by: "b", settings: snap(2) },
      { at: "not a date", by: "c", settings: snap(3) },
      { at: "2026-10-06T00:00:00Z", by: "d", settings: { hero_image_url: 5 } },
      { at: "2026-10-07T00:00:00Z", settings: null },
      null,
      "junk",
    ],
  };
  assert.deepEqual(sanitizeHistory(stored).map((item) => item.by), ["b", "a"]);
  assert.deepEqual(sanitizeHistory(null), []);
  assert.deepEqual(sanitizeHistory({ items: "x" }), []);
});

test("stored values are length-limited", () => {
  const [item] = sanitizeHistory({ items: [{ at: "2026-10-01T00:00:00Z", by: "x".repeat(900), settings: snap(1, { hero_image_url: "y".repeat(9000) }) }] });
  assert.equal(item.by.length, 200);
  assert.equal(item.settings.hero_image_url.length, 2000);
});
