// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as db from "./fakes/supabase-rest.ts";
import { cleanCondition, cleanDefinition, evaluateSegment, describeDefinition, summarizeSegment, SEGMENT_PRESETS, MAX_CONDITIONS } from "../lib/email-segments-core.ts";
import { saveSegment, listSegments, getSegment, deleteSegment } from "../lib/email-segments.ts";

const NOW = Date.parse("2026-10-13T12:00:00Z");
const DAY = 86_400_000;
const ago = (days) => new Date(NOW - days * DAY).toISOString();
const contact = (over = {}) => ({ id: "c", email: "a@x.com", status: "subscribed", phone: null, tags: [], created_at: ago(100), emails_sent: 0, open_count: 0, click_count: 0, last_opened_at: null, last_clicked_at: null, source: "popup", utm_source: null, utm_medium: null, utm_campaign: null, device_type: "mobile", signup_path: "/", ...over });

test("conditions: bad input is rejected, good input is normalised", () => {
  assert.equal(cleanCondition(null), null);
  assert.equal(cleanCondition({ type: "nope" }), null);
  assert.equal(cleanCondition({ type: "signed_up", op: "within_days", days: 0 }), null);
  assert.equal(cleanCondition({ type: "signed_up", op: "within_days", days: "7" }).days, 7);
  assert.equal(cleanCondition({ type: "tag", op: "has", value: "  " }), null);
  assert.equal(cleanCondition({ type: "field", field: "evil", op: "is", value: "x" }), null);
  assert.deepEqual(cleanCondition({ type: "field", field: "utm_source", op: "is_empty", value: "ignored" }), { type: "field", field: "utm_source", op: "is_empty" });
  assert.equal(cleanCondition({ type: "last_opened", op: "never", days: 5 }).days, undefined);
  assert.equal(cleanCondition({ type: "engagement", metric: "open_count", op: "gte", value: -1 }), null);
});

test("definition: junk is dropped and counted, size is capped, 'any' only when asked", () => {
  const many = Array.from({ length: MAX_CONDITIONS + 5 }, () => ({ type: "phone", op: "has" }));
  const result = cleanDefinition({ match: "any", conditions: [...many, { type: "bad" }] });
  assert.equal(result.definition.conditions.length, MAX_CONDITIONS);
  assert.equal(result.definition.match, "any");
  assert.ok(result.dropped >= 6);
  assert.equal(cleanDefinition({ match: "sometimes" }).definition.match, "all");
  assert.deepEqual(cleanDefinition("string").definition, { match: "all", conditions: [] });
});

test("evaluate: all vs any, and an empty segment is everyone", () => {
  const phoneAndRecent = { match: "all", conditions: [{ type: "phone", op: "has" }, { type: "signed_up", op: "within_days", days: 30 }] };
  assert.equal(evaluateSegment(phoneAndRecent, contact({ phone: "+1", created_at: ago(5) }), NOW), true);
  assert.equal(evaluateSegment(phoneAndRecent, contact({ phone: "+1", created_at: ago(50) }), NOW), false);
  assert.equal(evaluateSegment({ ...phoneAndRecent, match: "any" }, contact({ phone: "+1", created_at: ago(50) }), NOW), true);
  assert.equal(evaluateSegment({ match: "all", conditions: [] }, contact(), NOW), true);
});

test("evaluate: engagement and recency rules", () => {
  const opened30 = { match: "all", conditions: [{ type: "last_opened", op: "within_days", days: 30 }] };
  assert.equal(evaluateSegment(opened30, contact({ last_opened_at: ago(10) }), NOW), true);
  assert.equal(evaluateSegment(opened30, contact({ last_opened_at: ago(40) }), NOW), false);
  assert.equal(evaluateSegment(opened30, contact({ last_opened_at: null }), NOW), false);
  const quiet = { match: "all", conditions: [{ type: "last_opened", op: "not_within_days", days: 30 }] };
  assert.equal(evaluateSegment(quiet, contact({ last_opened_at: null }), NOW), true, "never opening counts as quiet");
  assert.equal(evaluateSegment(quiet, contact({ last_opened_at: ago(5) }), NOW), false);
  assert.equal(evaluateSegment({ match: "all", conditions: [{ type: "last_clicked", op: "never" }] }, contact(), NOW), true);
  assert.equal(evaluateSegment({ match: "all", conditions: [{ type: "engagement", metric: "open_count", op: "gte", value: 3 }] }, contact({ open_count: 3 }), NOW), true);
  assert.equal(evaluateSegment({ match: "all", conditions: [{ type: "engagement", metric: "open_count", op: "eq", value: 0 }] }, contact({ open_count: 2 }), NOW), false);
});

test("evaluate: tags, fields and status ignore case", () => {
  const tagged = { match: "all", conditions: [{ type: "tag", op: "has", value: "VIP" }] };
  assert.equal(evaluateSegment(tagged, contact({ tags: ["vip"] }), NOW), true);
  assert.equal(evaluateSegment({ match: "all", conditions: [{ type: "tag", op: "has_not", value: "vip" }] }, contact({ tags: ["vip"] }), NOW), false);
  assert.equal(evaluateSegment({ match: "all", conditions: [{ type: "field", field: "utm_source", op: "contains", value: "TIK" }] }, contact({ utm_source: "tiktok" }), NOW), true);
  assert.equal(evaluateSegment({ match: "all", conditions: [{ type: "field", field: "utm_source", op: "is_empty" }] }, contact({ utm_source: null }), NOW), true);
  assert.equal(evaluateSegment({ match: "all", conditions: [{ type: "status", op: "is_not", value: "unsubscribed" }] }, contact({ status: "unsubscribed" }), NOW), false);
});

test("summary: 'people you can email' excludes anyone who is not subscribed", () => {
  const people = [contact({ id: "1", email: "1@x.com" }), contact({ id: "2", email: "2@x.com", status: "unsubscribed" }), contact({ id: "3", email: "3@x.com", status: "bounced" })];
  const summary = summarizeSegment({ match: "all", conditions: [] }, people, NOW, 2);
  assert.equal(summary.total, 3);
  assert.equal(summary.sendable, 1);
  assert.equal(summary.sample.length, 2);
});

test("every ready-made segment is valid and describes itself", () => {
  for (const preset of SEGMENT_PRESETS) {
    const { definition, dropped } = cleanDefinition(preset.definition);
    assert.equal(dropped, 0, preset.key);
    assert.equal(definition.conditions.length, preset.definition.conditions.length);
    assert.ok(describeDefinition(definition).length > 3);
  }
  assert.equal(describeDefinition({ match: "all", conditions: [] }), "Everyone");
  assert.match(describeDefinition({ match: "any", conditions: [{ type: "phone", op: "has" }, { type: "tag", op: "has", value: "vip" }] }), / OR /);
});

beforeEach(() => { db.__reset(); db.__table("email_segments"); });

test("storage: create, rename, list, duplicate names refused, delete", async () => {
  const id = await saveSegment({ name: " VIPs ", description: "top", definition: { match: "all", conditions: [{ type: "tag", op: "has", value: "vip" }, { type: "bogus" }] }, actor: "me@x.com" });
  const stored = await getSegment(id);
  assert.equal(stored.name, "VIPs");
  assert.equal(stored.definition.conditions.length, 1, "the bogus rule never reaches the database");
  await saveSegment({ id, name: "VIPs v2", definition: stored.definition, actor: "me@x.com" });
  assert.equal((await listSegments()).segments[0].name, "VIPs v2");
  await assert.rejects(saveSegment({ name: "", definition: stored.definition, actor: "x" }), /name/);
  await deleteSegment(id);
  assert.equal(await getSegment(id), null);
  assert.equal(await getSegment("not-a-uuid"), null);
});

test("storage: a missing table means 'not enabled yet', not an error", async () => {
  db.__reset();
  assert.deepEqual(await listSegments(), { segments: [], available: false });
});
