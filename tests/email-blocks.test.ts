// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test from "node:test";
import assert from "node:assert/strict";
import { cleanTemplate, cleanBlock, cleanUrl, cleanDesign, defaultBlock, renderEmail, applyMergeTags, formatText, TEMPLATE_PRESETS, BLOCK_TYPES, MAX_BLOCKS, DEFAULT_DESIGN } from "../lib/email-blocks.ts";

let n = 0;
const ids = () => `id${++n}`;
const ctx = (over = {}) => ({ siteUrl: "https://streetdotcom.com", unsubscribeUrl: "https://streetdotcom.com/unsub/abc", ...over });

test("urls: only http, https, mailto and the two merge tags survive", () => {
  assert.equal(cleanUrl("https://a.com/x?y=1"), "https://a.com/x?y=1");
  assert.equal(cleanUrl("javascript:alert(1)"), "");
  assert.equal(cleanUrl("data:text/html,<script>"), "");
  assert.equal(cleanUrl("//evil.com"), "");
  assert.equal(cleanUrl("{{ unsubscribe_url }}"), "{{ unsubscribe_url }}");
  assert.equal(cleanUrl("{{other}}"), "");
  assert.equal(cleanUrl("mailto:me@x.com"), "mailto:me@x.com");
});

test("design: colours must be hex, fonts must be known", () => {
  const d = cleanDesign({ background: "red", accent: "#ABCDEF", font: "comic", textColor: "url(x)" });
  assert.equal(d.background, DEFAULT_DESIGN.background);
  assert.equal(d.accent, "#abcdef");
  assert.equal(d.font, "sans");
  assert.equal(d.textColor, DEFAULT_DESIGN.textColor);
});

test("blocks: unknown types are dropped and counted, ids are unique, size is capped", () => {
  const many = Array.from({ length: MAX_BLOCKS + 3 }, () => ({ type: "divider" }));
  const result = cleanTemplate({ name: " A  B ", blocks: [...many, { type: "script" }] }, ids);
  assert.equal(result.template.blocks.length, MAX_BLOCKS);
  assert.ok(result.dropped >= 4);
  assert.equal(result.template.name, "A B");
  assert.equal(new Set(result.template.blocks.map((b) => b.id)).size, MAX_BLOCKS);
  const dup = cleanTemplate({ blocks: [{ id: "same", type: "divider" }, { id: "same", type: "divider" }] }, ids);
  assert.notEqual(dup.template.blocks[0].id, dup.template.blocks[1].id);
  assert.equal(cleanBlock({ type: "image", url: "javascript:x" }, ids).url, "");
  assert.equal(cleanBlock({ type: "spacer", height: 9999 }, ids).height, 120);
  assert.equal(cleanBlock({ type: "products", count: 99, columns: 7 }, ids).count, 12);
  assert.equal(cleanBlock({ type: "products", columns: 7 }, ids).columns, 2);
});

test("every block type has a valid starter and survives cleaning unchanged", () => {
  for (const { type } of BLOCK_TYPES) {
    const block = defaultBlock(type, ids);
    assert.deepEqual(cleanBlock(block, ids), block, type);
  }
});

test("every starter template validates and renders", () => {
  for (const preset of TEMPLATE_PRESETS) {
    const built = preset.build(ids);
    const { template, dropped } = cleanTemplate(built, ids);
    assert.equal(dropped, 0, preset.key);
    const out = renderEmail(template, ctx({ preview: true }));
    assert.match(out.html, /Unsubscribe/);
    assert.ok(out.html.startsWith("<!doctype html>"));
  }
});

test("merge tags: values, fallbacks and unknown names", () => {
  assert.equal(applyMergeTags("Hi {{first_name|there}}!", {}), "Hi there!");
  assert.equal(applyMergeTags("Hi {{first_name|there}}!", { first_name: "Sam" }), "Hi Sam!");
  assert.equal(applyMergeTags("{{ nothing }}x", {}), "x");
});

test("text is escaped; only bold and http(s) links are allowed", () => {
  const html = formatText('<script>alert(1)</script> **bold** [ok](https://a.com) [bad](javascript:alert(1))\n\nSecond', {});
  assert.ok(!html.includes("<script>"));
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<a href="https:\/\/a\.com"/);
  assert.ok(!/href="javascript/.test(html));
  assert.equal((html.match(/<p /g) ?? []).length, 2);
});

test("render: the unsubscribe footer is always there and cannot be removed", () => {
  const out = renderEmail({ name: "x", subject: "Hello {{first_name|friend}}", preheader: "pre", design: DEFAULT_DESIGN, blocks: [] }, ctx({ mailingAddress: "1 Main St, Town" }));
  assert.match(out.html, /href="https:\/\/streetdotcom\.com\/unsub\/abc"/);
  assert.match(out.html, /1 Main St, Town/);
  assert.equal(out.subject, "Hello friend");
  assert.match(out.text, /Unsubscribe: https:\/\/streetdotcom\.com\/unsub\/abc/);
});

test("render: hostile text in any field is escaped", () => {
  const { template } = cleanTemplate({
    name: "x", subject: "<b>s</b>", preheader: "<i>p</i>",
    blocks: [
      { type: "heading", text: '<img src=x onerror=alert(1)>' },
      { type: "button", label: '"><script>', url: "https://a.com/?a=1&b=2" },
      { type: "feature", heading: "<h1>", text: "<u>t</u>", imageUrl: "https://a.com/i.png", buttonLabel: "Go", buttonUrl: "https://a.com" },
    ],
  }, ids);
  const { html } = renderEmail(template, ctx());
  assert.ok(!/<script/i.test(html));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("<u>t</u>"));
  assert.match(html, /a=1&amp;b=2/);
});

test("render: product blocks use resolved products; empty blocks vanish when sending and show a hint in preview", () => {
  const block = { ...defaultBlock("products", ids), id: "prod1", title: "Fresh", count: 2, columns: 2 };
  const template = { name: "x", subject: "s", preheader: "", design: DEFAULT_DESIGN, blocks: [block] };
  const cards = [
    { title: "Tee <1>", brandName: "Acme", price: 40, imageUrl: "https://a.com/1.jpg", url: "https://streetdotcom.com/products/acme--tee" },
    { title: "Hat", brandName: "Acme", price: 25.5, imageUrl: "", url: "https://streetdotcom.com/products/acme--hat" },
    { title: "Third", brandName: "Acme", price: 1, imageUrl: "", url: "https://x" },
  ];
  const sent = renderEmail(template, ctx({ products: { prod1: cards } }));
  assert.match(sent.html, /Tee &lt;1&gt;/);
  assert.match(sent.html, /\$40/);
  assert.match(sent.html, /\$25\.50/);
  assert.ok(!sent.html.includes("Third"), "count limits the cards");
  assert.match(sent.text, /Acme - Hat \(\$25\.50\)/);
  const empty = renderEmail(template, ctx());
  assert.ok(!empty.html.includes("Fresh"), "nothing to show means the block is skipped");
  assert.match(renderEmail(template, ctx({ preview: true })).html, /Product name 1/);
});

test("render: button without a link is skipped when sending", () => {
  const template = { name: "x", subject: "", preheader: "", design: DEFAULT_DESIGN, blocks: [{ ...defaultBlock("button", ids), url: "" }] };
  assert.ok(!renderEmail(template, ctx()).html.includes("Shop now"));
});
