// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as db from "./fakes/supabase-rest.ts";
import { TEMPLATE_PRESETS, defaultBlock, renderEmail } from "../lib/email-blocks.ts";
import { createTemplate, getTemplate, updateTemplate, listTemplates, setTemplateArchived, duplicateTemplate } from "../lib/email-templates.ts";
import { findProductCards, resolveProducts } from "../lib/email-products.ts";

beforeEach(() => { db.__reset(); db.__table("email_templates"); });

test("create from a starter, then read it back unchanged", async () => {
  const preset = TEMPLATE_PRESETS[0].build();
  const id = await createTemplate(preset, "me@x.com");
  const stored = await getTemplate(id);
  assert.equal(stored.name, "New arrivals");
  assert.equal(stored.blocks.length, preset.blocks.length);
  assert.equal(stored.created_by, "me@x.com");
  assert.equal(await getTemplate("nope"), null);
});

test("saving re-validates: hostile or broken blocks never reach the database", async () => {
  const id = await createTemplate(TEMPLATE_PRESETS[3].build(), "me");
  const result = await updateTemplate(id, {
    name: "  ", subject: "Hi",
    design: { accent: "javascript:alert(1)" },
    blocks: [{ type: "image", url: "javascript:alert(1)" }, { type: "script", src: "x" }, { type: "heading", text: "Ok" }],
  });
  assert.equal(result.dropped, 1);
  const stored = await getTemplate(id);
  assert.equal(stored.name, "Untitled email", "a blank name gets a default");
  assert.equal(stored.blocks.length, 2);
  assert.equal(stored.blocks[0].url, "");
  assert.notEqual(stored.design.accent, "javascript:alert(1)");
});

test("archive hides a template from the list; duplicate gets fresh block ids", async () => {
  const id = await createTemplate(TEMPLATE_PRESETS[1].build(), "me");
  const copyId = await duplicateTemplate(id, "me");
  const original = await getTemplate(id);
  const copy = await getTemplate(copyId);
  assert.match(copy.name, /\(copy\)$/);
  assert.equal(copy.blocks.length, original.blocks.length);
  assert.ok(copy.blocks.every((block, i) => block.id !== original.blocks[i].id));
  await setTemplateArchived(id, true);
  assert.deepEqual((await listTemplates()).templates.map((t) => t.id), [copyId]);
  assert.equal((await listTemplates(true)).templates.length, 2);
  await setTemplateArchived(id, false);
  assert.equal((await listTemplates()).templates.length, 2);
});

test("missing table means 'not enabled yet'", async () => {
  db.__reset();
  assert.deepEqual(await listTemplates(), { templates: [], available: false });
  assert.equal(await getTemplate("11111111-1111-4111-8111-111111111111"), null);
});

function seedProducts() {
  db.__table("products", [
    { id: "p1", handle: "tee", title: "Tee", price: 30, compare_at_price: null, primary_image_url: "https://i/1.jpg", is_active: true, is_hidden: false, deleted_at: null, created_at: "2026-10-10T00:00:00Z", brands: { slug: "acme", name: "Acme" } },
    { id: "p2", handle: "hat", title: "Hat", price: 20, compare_at_price: 40, primary_image_url: null, is_active: true, is_hidden: false, deleted_at: null, created_at: "2026-10-12T00:00:00Z", brands: { slug: "acme", name: "Acme" } },
    { id: "p3", handle: "hidden", title: "Hidden", price: 5, compare_at_price: null, primary_image_url: null, is_active: true, is_hidden: true, deleted_at: null, created_at: "2026-10-12T00:00:00Z", brands: { slug: "acme", name: "Acme" } },
  ]);
}

test("product cards: live products only, newest first, with storefront links", async () => {
  seedProducts();
  const cards = await findProductCards({ maxPrice: 100 }, 5, "newest", Date.parse("2026-10-13T00:00:00Z"));
  assert.deepEqual(cards.map((c) => c.title), ["Hat", "Tee"], "hidden product excluded");
  assert.match(cards[0].url, /\/products\/acme--hat$/);
  assert.equal(cards[1].imageUrl, "https://i/1.jpg");
  assert.equal((await findProductCards({ onSale: true }, 5, "newest")).map((c) => c.title).join(), "Hat");
  assert.equal((await findProductCards({}, 1, "price_asc")).length, 1);
});

test("resolving a layout fills every products block and renders it", async () => {
  seedProducts();
  const block = { ...defaultBlock("products"), id: "pb", count: 2, criteria: {} };
  const products = await resolveProducts([defaultBlock("divider"), block]);
  assert.deepEqual(Object.keys(products), ["pb"]);
  const html = renderEmail({ name: "x", subject: "", preheader: "", design: TEMPLATE_PRESETS[0].build().design, blocks: [block] }, { siteUrl: "https://s", unsubscribeUrl: "https://s/u", products }).html;
  assert.match(html, /Hat/);
  assert.match(html, /Tee/);
});
