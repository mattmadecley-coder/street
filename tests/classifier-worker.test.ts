// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as db from "./fakes/supabase-rest.ts";
import { validateClassification, isAiOutage } from "../lib/ai-product-classifier.ts";
import { locateTaxonomyName } from "../lib/street-taxonomy.ts";
import { classifyQueuedProduct } from "../lib/classification-recovery.ts";
import { countFallbackProducts, requeueFallbackProducts, FALLBACK_MODEL } from "../lib/classification-requeue.ts";
import { evaluateHealth } from "../lib/system-health.ts";

const realFetch = globalThis.fetch;
let calls = [];
function mockOpenRouter(handler) {
  process.env.OPENROUTER_API_KEY = "test-key";
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const second = String(body.messages?.[0]?.content ?? "").includes("second-opinion");
    calls.push(second ? "second" : "first");
    const out = handler(second ? "second" : "first");
    return { ok: out.status === 200, status: out.status, json: async () => out.body };
  };
}
const answer = (content) => ({ status: 200, body: { model: "test/model", choices: [{ message: { content: JSON.stringify(content) } }] } });
const first = (over = {}) => answer({ group: "Apparel", category: "Tops", type: "Knitwear", detail: "Sweaters", activity: "none", tags: [], colors: ["Gray"], confidence: "high", ...over });

beforeEach(() => {
  db.__reset();
  db.__table("products", [{ id: "p1", title: "Pattern Knit - Dust Gray", classification_status: "pending", is_active: true }]);
  calls = [];
});
afterEach(() => { globalThis.fetch = realFetch; });

const product = { id: "p1", title: "Pattern Knit - Dust Gray", description: "", category: "Apparel", tags: [], colors: [] };

test("a type named as the category is filed where it belongs instead of failing", () => {
  const result = validateClassification({ group: "Apparel", category: "Knitwear", type: "none", detail: "none", tags: [], colors: [], confidence: "high" });
  assert.deepEqual([result.group, result.category, result.type, result.confidence], ["Apparel", "Tops", "Knitwear", "medium"]);
  const detail = validateClassification({ group: "Apparel", category: "Sweaters", type: "none", detail: "none", tags: [], colors: [], confidence: "medium" });
  assert.deepEqual([detail.category, detail.type, detail.detail], ["Tops", "Knitwear", "Sweaters"]);
  assert.throws(() => validateClassification({ group: "Apparel", category: "Nonsense", confidence: "high" }), /doesn't exist/);
});

test("ambiguous names are never guessed", () => {
  assert.equal(locateTaxonomyName("Sets"), null, "exists under Apparel/Sets and Apparel/Tailoring");
  assert.equal(locateTaxonomyName("Knitwear").type, "Knitwear");
  assert.equal(locateTaxonomyName(""), null);
});

test("outage detection: credits, keys, rate limits and network errors are not the product's fault", () => {
  assert.ok(isAiOutage('OpenRouter request failed (402): {"error":{"message":"Insufficient credits'));
  assert.ok(isAiOutage("OpenRouter request failed (429): slow down"));
  assert.ok(isAiOutage("fetch failed"));
  assert.ok(!isAiOutage('Classifier returned category "Nonsense", which doesn\'t exist under any group.'));
  assert.ok(!isAiOutage("Unterminated string in JSON at position 3"));
});

test("confident first pass: classified, one call, pass 1", async () => {
  mockOpenRouter(() => first());
  const result = await classifyQueuedProduct(product);
  assert.equal(result.status, "classified");
  assert.deepEqual(calls, ["first"]);
  const row = db.__rows("products")[0];
  assert.equal(row.street_type, "Knitwear");
  assert.equal(row.classification_pass, 1);
});

test("low confidence first pass triggers the second pass, and both answers are recorded", async () => {
  mockOpenRouter((which) => which === "first"
    ? first({ type: "none", detail: "none", confidence: "low" })
    : answer({ candidates: [{ group: "Apparel", category: "Tops", type: "Knitwear", detail: "Sweaters", reason: "knit" }, { group: "Apparel", category: "Tops", type: "none", detail: "none", reason: "" }, { group: "Apparel", category: "Bottoms", type: "none", detail: "none", reason: "" }], best: 0, activity: "none", tags: [], colors: ["Gray"], confidence: "high" }));
  const result = await classifyQueuedProduct(product);
  assert.equal(result.status, "classified");
  assert.equal(result.secondPass, true);
  assert.deepEqual(calls, ["first", "second"]);
  const row = db.__rows("products")[0];
  assert.equal(row.classification_pass, 2);
  assert.equal(row.street_type, "Knitwear");
  assert.equal(row.classification_first_guess.confidence, "low");
});

test("second pass is skipped when the batch is nearly out of time, and the first answer is kept", async () => {
  mockOpenRouter(() => first({ type: "none", detail: "none", confidence: "low" }));
  const result = await classifyQueuedProduct(product, Date.now() - 40_000);
  assert.equal(result.status, "needs_review");
  assert.deepEqual(calls, ["first"]);
});

test("out of credits: the product is left in the queue with the reason, and no placeholder is written", async () => {
  mockOpenRouter(() => ({ status: 402, body: { error: { message: "Insufficient credits." } } }));
  const result = await classifyQueuedProduct(product);
  assert.equal(result.status, "deferred");
  const row = db.__rows("products")[0];
  assert.equal(row.classification_status, "pending");
  assert.equal(row.street_category, undefined);
  assert.match(row.classification_error, /AI unavailable/);
});

test("a genuinely unparseable answer still falls back to a visible low-confidence guess (knit -> Knitwear)", async () => {
  mockOpenRouter(() => ({ status: 200, body: { model: "m", choices: [{ message: { content: "not json" } }] } }));
  const result = await classifyQueuedProduct(product);
  assert.equal(result.status, "needs_review");
  assert.equal(result.usedFallback, true);
  const row = db.__rows("products")[0];
  assert.equal(row.classification_model, FALLBACK_MODEL);
  assert.equal(row.street_type, "Knitwear", "the rule list now knows knitwear");
  assert.equal(row.street_detail, "Sweaters");
});

test("re-queue: only placeholder products go back to pending", async () => {
  db.__reset();
  db.__table("products", [
    { id: "a", classification_status: "needs_review", classification_model: FALLBACK_MODEL, classification_error: "x", is_active: true },
    { id: "b", classification_status: "needs_review", classification_model: "deepseek/deepseek-chat", classification_error: null, is_active: true },
    { id: "c", classification_status: "classified", classification_model: FALLBACK_MODEL, classification_error: null, is_active: true },
  ]);
  assert.equal(await countFallbackProducts(), 1);
  assert.equal(await requeueFallbackProducts(), 1);
  const rows = Object.fromEntries(db.__rows("products").map((row) => [row.id, row]));
  assert.equal(rows.a.classification_status, "pending");
  assert.equal(rows.a.classification_error, null);
  assert.equal(rows.b.classification_status, "needs_review");
  assert.equal(rows.c.classification_status, "classified");
  assert.equal(await requeueFallbackProducts(), 0);
});

test("health: placeholder products raise a red AI classifier item", () => {
  const base = { nowMs: Date.now(), lastCatalogSyncMs: Date.now(), failingImports: 0, pendingClassification: 0, needsReview: 5, latestEventMs: Date.now() };
  assert.ok(!evaluateHealth(base).some((item) => item.key === "ai-classifier"));
  const item = evaluateHealth({ ...base, aiFallbackCount: 2000 }).find((entry) => entry.key === "ai-classifier");
  assert.equal(item.level, "bad");
  assert.match(item.detail, /credits/);
});
