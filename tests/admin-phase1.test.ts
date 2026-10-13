// @ts-nocheck -- run with `npm test` (Node's built-in runner, no extra dependencies).
// Imports use explicit .ts extensions because Node strips types natively.
import test from "node:test";
import assert from "node:assert/strict";
import { safeAdminPath } from "../lib/safe-redirect.ts";
import { describeChange, describeRateChange } from "../lib/analytics-change.ts";
import { METRIC_GLOSSARY } from "../lib/analytics-glossary.ts";

test("safeAdminPath keeps real admin paths", () => {
  assert.equal(safeAdminPath("/admin"), "/admin");
  assert.equal(safeAdminPath("/admin/products?status=needs_review&page=3"), "/admin/products?status=needs_review&page=3");
  assert.equal(safeAdminPath("/admin/brands#acme"), "/admin/brands#acme");
});

test("safeAdminPath rejects anything that could leave /admin", () => {
  const fallback = "/admin";
  for (const bad of [
    "https://evil.example/admin",
    "//evil.example",
    "/\\evil.example",
    "/adminevil",
    "/admin/../secret",
    "/admin/%0d%0aSet-Cookie",
    "/admin\r\nX: y",
    "javascript:alert(1)",
    "",
    null,
    undefined,
  ]) {
    assert.equal(safeAdminPath(bad, fallback), fallback, `should reject ${JSON.stringify(bad)}`);
  }
  assert.equal(safeAdminPath("https://evil.example", "/admin/products"), "/admin/products");
});

test("describeChange never reports fake growth when there is no prior data", () => {
  assert.deepEqual(describeChange(493, 0), { text: "No prior data", tone: "none", absolute: 493 });
  assert.equal(describeChange(0, 0).text, "No activity");
});

test("describeChange computes real percentages and tones", () => {
  assert.equal(describeChange(150, 100).text, "+50.0%");
  assert.equal(describeChange(150, 100).tone, "up");
  assert.equal(describeChange(50, 100).text, "−50.0%");
  assert.equal(describeChange(50, 100).tone, "down");
  assert.equal(describeChange(100, 100).tone, "flat");
  assert.equal(describeChange(0, 100).text, "−100.0%");
});

test("describeRateChange reports percentage points and handles empty denominators", () => {
  assert.equal(describeRateChange(10, 100, 5, 100).text, "+5.0 pts");
  assert.equal(describeRateChange(5, 100, 10, 100).text, "−5.0 pts");
  assert.equal(describeRateChange(10, 100, 0, 0).text, "No prior data");
  assert.equal(describeRateChange(0, 0, 10, 100).text, "No activity");
});

test("every glossary entry is a non-empty sentence", () => {
  for (const [key, value] of Object.entries(METRIC_GLOSSARY)) {
    assert.ok(value.length > 20, `${key} needs a real definition`);
    assert.ok(/[.]$/.test(value), `${key} should end with a period`);
  }
});
