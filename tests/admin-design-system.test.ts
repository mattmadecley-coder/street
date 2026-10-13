// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NAV_GROUPS, isNavActive } from "../components/admin/nav-config.ts";

const items = NAV_GROUPS.flatMap((group) => group.items);
const find = (href) => items.find((item) => item.href === href);

test("nav highlights exactly one item for every admin page", () => {
  const pages = [
    "/admin", "/admin/brands", "/admin/brands/new", "/admin/products", "/admin/collections", "/admin/collections/summer",
    "/admin/homepage", "/admin/reports", "/admin/social", "/admin/social/tiktok",
    "/admin/analytics", "/admin/analytics/growth", "/admin/analytics/brands/acme", "/admin/analytics/comparison", "/admin/analytics/alerts", "/admin/analytics/glossary", "/admin/settings", "/admin/team", "/admin/activity",
  ];
  for (const page of pages) {
    const active = items.filter((item) => isNavActive(page, item)).map((item) => item.label);
    assert.equal(active.length, 1, `${page} highlighted ${JSON.stringify(active)}`);
  }
});

test("Home is only active on /admin and Analytics does not swallow Compare or Alerts", () => {
  assert.equal(isNavActive("/admin/brands", find("/admin")), false);
  assert.equal(isNavActive("/admin/analytics/comparison", find("/admin/analytics")), false);
  assert.equal(isNavActive("/admin/analytics/alerts", find("/admin/analytics")), false);
  assert.equal(isNavActive("/admin/analytics/growth", find("/admin/analytics")), true);
});

// ---- WCAG contrast of the real design tokens -------------------------------
const css = readFileSync(new URL("../app/admin/admin-ui.css", import.meta.url), "utf8").split("\r\n").join("\n");

function tokensIn(block) {
  const out = {};
  for (const match of block.matchAll(/--adm-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[match[1]] = match[2];
  return out;
}
function blockAfter(selector) {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, `missing ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}
const light = tokensIn(blockAfter(".adm {\n  --adm-bg"));
const dark = tokensIn(blockAfter('.adm[data-theme="dark"] {'));

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

for (const [name, tokens] of [["light", light], ["dark", dark]]) {
  test(`${name} theme: body and secondary text meet WCAG AA (4.5:1) on every surface`, () => {
    for (const surface of ["bg", "surface", "surface-2", "surface-3"]) {
      for (const text of ["text", "text-2", "text-3"]) {
        const ratio = contrast(tokens[text], tokens[surface]);
        assert.ok(ratio >= 4.5, `${text} on ${surface} is ${ratio.toFixed(2)}:1`);
      }
    }
  });

  test(`${name} theme: status colors are readable on their backgrounds`, () => {
    for (const tone of ["success", "warn", "danger", "info"]) {
      const ratio = contrast(tokens[tone], tokens[`${tone}-bg`]);
      assert.ok(ratio >= 4.5, `${tone} on ${tone}-bg is ${ratio.toFixed(2)}:1`);
    }
    assert.ok(contrast(tokens["accent-contrast"], tokens.accent) >= 7, "button text on accent");
  });
}
