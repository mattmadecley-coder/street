// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test from "node:test";
import assert from "node:assert/strict";
import { cleanAnnotation, addAnnotation, removeAnnotation, sanitizeStoredAnnotations, MAX_ANNOTATIONS, MAX_ANNOTATION_TEXT } from "../lib/analytics-annotations.ts";
import { newAlertsSince, nextMemory, formatDigest } from "../lib/alert-digest.ts";

let n = 0;
const id = () => `id-${++n}`;

test("annotations: valid input is cleaned and trimmed", () => {
  const note = cleanAnnotation({ date: "2026-10-10", text: "  Broken   Planet \n drop " }, id);
  assert.equal(note.date, "2026-10-10");
  assert.equal(note.text, "Broken Planet drop");
});

test("annotations: bad dates, impossible dates and empty text are rejected", () => {
  const bad = [
    { date: "10/10/2026", text: "x" },
    { date: "2026-13-40", text: "x" },
    { date: "2026-02-31", text: "x" },
    { date: "2026-04-31", text: "x" },
    { date: "not-a-date", text: "x" },
    { date: "2026-10-10", text: "   " },
    { date: "", text: "x" },
    {},
  ];
  for (const input of bad) assert.equal(cleanAnnotation(input, id), null, JSON.stringify(input));
  assert.ok(cleanAnnotation({ date: "2028-02-29", text: "leap day" }, id), "real leap day is fine");
});

test("annotations: text is capped and html is kept as plain text", () => {
  const note = cleanAnnotation({ date: "2026-10-10", text: `<script>alert(1)</script>${"x".repeat(200)}` }, id);
  assert.equal(note.text.length, MAX_ANNOTATION_TEXT);
  assert.ok(note.text.startsWith("<script>"), "stored as text; React escapes it when rendered");
});

test("annotations: list stays sorted by date and capped", () => {
  let list = [];
  list = addAnnotation(list, { id: "a", date: "2026-10-12", text: "later" });
  list = addAnnotation(list, { id: "b", date: "2026-10-01", text: "earlier" });
  assert.deepEqual(list.map((item) => item.id), ["b", "a"]);
  for (let i = 0; i < MAX_ANNOTATIONS + 20; i++) list = addAnnotation(list, { id: `n${i}`, date: "2026-11-01", text: "x" });
  assert.equal(list.length, MAX_ANNOTATIONS);
  assert.deepEqual(removeAnnotation([{ id: "a" }, { id: "b" }], "a"), [{ id: "b" }]);
});

test("annotations: corrupted stored data cannot break the chart", () => {
  assert.deepEqual(sanitizeStoredAnnotations(null), []);
  assert.deepEqual(sanitizeStoredAnnotations({ items: "nope" }), []);
  const good = { id: "g", date: "2026-10-10", text: "ok" };
  const out = sanitizeStoredAnnotations({ items: [good, null, 5, { id: "", date: "2026-10-10", text: "no id" }, { id: "x", date: "bad", text: "bad date" }] });
  assert.deepEqual(out, [good]);
});

const warn = (key) => ({ key, severity: "warning", title: key, detail: `${key} detail` });
const crit = (key) => ({ key, severity: "critical", title: key, detail: `${key} detail` });

test("digest: only new or escalated alerts are reported", () => {
  assert.deepEqual(newAlertsSince([warn("a"), warn("b")], {}).map((x) => x.key), ["a", "b"]);
  assert.deepEqual(newAlertsSince([warn("a"), warn("b")], { a: "warning" }).map((x) => x.key), ["b"]);
  assert.deepEqual(newAlertsSince([crit("a")], { a: "warning" }).map((x) => x.key), ["a"]);
  assert.deepEqual(newAlertsSince([warn("a")], { a: "critical" }).length, 0);
});

test("digest: memory is the set of open alerts, so a recurrence notifies again", () => {
  assert.deepEqual(nextMemory([warn("a"), crit("b")]), { a: "warning", b: "critical" });
  assert.deepEqual(nextMemory([]), {});
  assert.equal(newAlertsSince([warn("a")], nextMemory([])).length, 1);
});

test("digest: message names every alert and links to the alerts page", () => {
  const message = formatDigest([crit("errors"), warn("ctr")], 3, "https://streetdotcom.com");
  assert.match(message.subject, /2 new alerts \(1 critical\)/);
  assert.match(message.text, /CRITICAL: errors/);
  assert.match(message.text, /3 alerts are open/);
  assert.match(message.slackText, /https:\/\/streetdotcom.com\/admin\/analytics\/alerts/);
  assert.match(formatDigest([warn("one")], 1, "https://x.test").subject, /1 new alert$/);
});
