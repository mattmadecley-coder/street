// @ts-nocheck -- run with `npm test`. Uses the in-memory stand-in for the database.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as db from "./fakes/supabase-rest.ts";
import { parseBulkIds, runBulk, bulkMessage, isBulkIntent, MAX_BULK } from "../lib/product-bulk.ts";
import { evaluateHealth, worstLevel, ago } from "../lib/system-health.ts";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const product = (n, over = {}) => ({ id: id(n), title: `P${n}`, classification_status: "needs_review", street_category: "Hoodies", is_hidden: false, deleted_at: null, ...over });

beforeEach(() => {
  db.__reset();
  db.__table("products", [
    product(1),
    product(2, { street_category: null }),                       // needs review but no category
    product(3, { classification_status: "classified" }),         // already a human/AI-approved product
    product(4, { is_hidden: true, deleted_at: "2026-10-01T00:00:00Z" }), // in the trash
    product(5),
  ]);
});

const row = (n) => db.__rows("products").find((r) => r.id === id(n));

test("ids: must be real, de-duplicated UUIDs, between 1 and 100", () => {
  assert.equal(parseBulkIds([]).ok, false);
  assert.equal(parseBulkIds(["", null, undefined]).ok, false);
  assert.equal(parseBulkIds(["1 or 1=1"]).ok, false);
  assert.equal(parseBulkIds([id(1), "drop table"]).ok, false);
  assert.deepEqual(parseBulkIds([id(1), id(1), id(2).toUpperCase()]), { ok: true, ids: [id(1), id(2)] });
  const many = Array.from({ length: MAX_BULK + 1 }, (_, i) => id(i + 1));
  assert.match(parseBulkIds(many).error, /at most 100/);
  assert.equal(parseBulkIds(many.slice(0, MAX_BULK)).ok, true);
});

test("intent allow-list", () => {
  for (const intent of ["approve", "hide", "unhide", "trash"]) assert.equal(isBulkIntent(intent), true);
  for (const intent of ["delete", "purge", "", undefined, null, "Approve"]) assert.equal(isBulkIntent(intent), false);
});

test("approve: only needs-review products WITH a category are approved; everything else is left alone", async () => {
  const result = await runBulk("approve", [id(1), id(2), id(3), id(5)], { trashOn: true });
  assert.deepEqual(result, { changed: 2, skipped: 2 });
  assert.equal(row(1).classification_status, "classified");
  assert.equal(row(1).classification_model, "manual-admin");
  assert.equal(row(5).classification_status, "classified");
  assert.equal(row(2).classification_status, "needs_review", "no category: stays in the review queue");
  assert.equal(row(3).classification_confidence, undefined, "an already-classified product is not rewritten");
});

test("approve: products outside the selection are never touched", async () => {
  await runBulk("approve", [id(1)], { trashOn: true });
  assert.equal(row(5).classification_status, "needs_review");
});

test("hide and unhide change only the selection; unhide never resurrects trashed products", async () => {
  assert.deepEqual(await runBulk("hide", [id(1), id(5)], { trashOn: true }), { changed: 2, skipped: 0 });
  assert.equal(row(1).is_hidden, true);
  assert.equal(row(3).is_hidden, false);
  const result = await runBulk("unhide", [id(1), id(4)], { trashOn: true });
  assert.deepEqual(result, { changed: 1, skipped: 1 });
  assert.equal(row(1).is_hidden, false);
  assert.equal(row(4).is_hidden, true, "trashed product stays hidden");
  assert.ok(row(4).deleted_at, "and stays in the trash");
});

test("trash: soft-deletes live products only and is refused without the trash column", async () => {
  const result = await runBulk("trash", [id(1), id(4)], { trashOn: true, nowIso: "2026-10-13T00:00:00Z" });
  assert.deepEqual(result, { changed: 1, skipped: 1 });
  assert.equal(row(1).deleted_at, "2026-10-13T00:00:00Z");
  assert.equal(row(1).is_hidden, true);
  assert.equal(row(4).deleted_at, "2026-10-01T00:00:00Z", "an already-trashed product keeps its original date");
  await assert.rejects(() => runBulk("trash", [id(5)], { trashOn: false }), /trash feature/);
  assert.equal(db.__rows("products").length, 5, "nothing was ever removed from the table");
  assert.equal(row(5).deleted_at, null);
});

test("messages say exactly what happened", () => {
  assert.equal(bulkMessage("approve", 12, 0), "Approved 12 products.");
  assert.equal(bulkMessage("approve", 1, 3), "Approved 1 product (3 skipped: not in review or no category yet).");
  assert.equal(bulkMessage("trash", 2, 1), "Moved to the trash 2 products (1 skipped).");
  assert.equal(bulkMessage("hide", 0, 4), "Hid 0 products (4 skipped).");
});

// ---- system health ---------------------------------------------------------
const NOW = Date.parse("2026-10-13T12:00:00Z");
const H = 3_600_000;
const healthy = { nowMs: NOW, lastCatalogSyncMs: NOW - 5 * H, failingImports: 0, pendingClassification: 0, needsReview: 0, latestEventMs: NOW - 10 * 60_000 };
const level = (input, key) => evaluateHealth(input).find((item) => item.key === key).level;

test("health: a healthy system is all ok", () => {
  assert.equal(worstLevel(evaluateHealth(healthy)), "ok");
});

test("health: catalog sync ages from ok to warn to bad; never-synced is bad", () => {
  assert.equal(level({ ...healthy, lastCatalogSyncMs: NOW - 30 * H }, "catalog-sync"), "ok");
  assert.equal(level({ ...healthy, lastCatalogSyncMs: NOW - 40 * H }, "catalog-sync"), "warn");
  assert.equal(level({ ...healthy, lastCatalogSyncMs: NOW - 80 * H }, "catalog-sync"), "bad");
  assert.equal(level({ ...healthy, lastCatalogSyncMs: null }, "catalog-sync"), "bad");
});

test("health: tracking, imports and queues", () => {
  assert.equal(level({ ...healthy, latestEventMs: NOW - 3 * H }, "tracking"), "warn");
  assert.equal(level({ ...healthy, latestEventMs: NOW - 7 * H }, "tracking"), "bad");
  assert.equal(level({ ...healthy, latestEventMs: null }, "tracking"), "bad");
  assert.equal(level({ ...healthy, failingImports: 2 }, "brand-imports"), "warn");
  assert.equal(level({ ...healthy, pendingClassification: 101 }, "classification"), "warn");
  assert.equal(level({ ...healthy, pendingClassification: 100 }, "classification"), "ok");
  assert.equal(level({ ...healthy, needsReview: 2580 }, "review-queue"), "warn");
  assert.equal(worstLevel(evaluateHealth({ ...healthy, latestEventMs: null, failingImports: 1 })), "bad");
});

test("health: relative times read naturally", () => {
  assert.equal(ago(NOW, NOW - 20_000), "just now");
  assert.equal(ago(NOW, NOW - 12 * 60_000), "12 min ago");
  assert.equal(ago(NOW, NOW - 5 * H), "5 hours ago");
  assert.equal(ago(NOW, NOW - 1 * H), "1 hour ago");
  assert.equal(ago(NOW, NOW - 72 * H), "3 days ago");
});
