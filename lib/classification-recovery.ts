import { randomUUID } from "node:crypto";
import { classifyProductWithAI, type ProductClassification } from "@/lib/ai-product-classifier";
import {
  ALL_STREET_CATEGORIES,
  STREET_COLORS,
  STREET_TAGS,
  groupForStreetCategory,
  type StreetColor,
  type StreetGroup,
  type StreetTag,
} from "@/lib/street-taxonomy";
import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";

// One worker invocation must always finish comfortably inside Vercel's 60-second
// runtime. OpenRouter performs model/provider failover inside each request, so a
// single application-level attempt is enough and prevents one batch from
// consuming the entire function lifetime.
const CLASSIFICATION_CONCURRENCY = 4;
const CLASSIFICATION_BATCH_MAX = 8;
const AI_ATTEMPTS = 1;
const WORKER_LEASE_SECONDS = 55;

export type RecoveryClassificationResult = {
  id: string;
  title: string;
  status: "classified" | "needs_review";
  group: string;
  category: string;
  usedFallback: boolean;
};

type QueuedProduct = {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[] | null;
  colors: string[] | null;
};

type Rule = {
  pattern: RegExp;
  group: StreetGroup;
  category: string;
  type?: string;
};

const RULES: Rule[] = [
  { pattern: /\b(jacket|bomber|puffer|varsity|windbreaker|track jacket|denim jacket|leather jacket)\b/i, group: "Apparel", category: "Outerwear", type: "Jackets" },
  { pattern: /\b(coat|trench|overcoat|peacoat)\b/i, group: "Apparel", category: "Outerwear", type: "Coats" },
  { pattern: /\b(vest|parka|anorak|poncho|cape)\b/i, group: "Apparel", category: "Outerwear" },
  { pattern: /\b(hoodie|sweatshirt|crewneck|sweater|cardigan|tee|t-shirt|t shirt|shirt|jersey|polo|tank|top|blouse)\b/i, group: "Apparel", category: "Tops" },
  { pattern: /\b(jeans?|pants?|trousers?|sweatpants?|joggers?|shorts?|skirt)\b/i, group: "Apparel", category: "Bottoms" },
  { pattern: /\b(dress|gown)\b/i, group: "Apparel", category: "Dresses" },
  { pattern: /\b(bikini|swim|swimsuit|swimwear)\b/i, group: "Apparel", category: "Swimwear" },
  { pattern: /\b(sneaker|shoe|trainer)\b/i, group: "Footwear", category: "Sneakers" },
  { pattern: /\b(boot)\b/i, group: "Footwear", category: "Boots" },
  { pattern: /\b(sandal|slide|flip flop)\b/i, group: "Footwear", category: "Sandals" },
  { pattern: /\b(heel|pump)\b/i, group: "Footwear", category: "Heels" },
  { pattern: /\b(cap|hat|beanie|balaclava|beret|fedora|snapback|trucker)\b/i, group: "Accessories", category: "Hats" },
  { pattern: /\b(sunglasses|glasses|goggles|eyewear)\b/i, group: "Accessories", category: "Eyewear" },
  { pattern: /\b(sock|tights)\b/i, group: "Accessories", category: "Socks and Tights" },
  { pattern: /\b(wallet|cardholder|money clip)\b/i, group: "Accessories", category: "Wallets" },
  { pattern: /\b(belt)\b/i, group: "Accessories", category: "Belts" },
  { pattern: /\b(keychain|lanyard)\b/i, group: "Accessories", category: "Keychains and Lanyards" },
  { pattern: /\b(phone case|airpod|earpod|headphone)\b/i, group: "Accessories", category: "Technology" },
  { pattern: /\b(tote)\b/i, group: "Bags", category: "Tote Bags" },
  { pattern: /\b(backpack)\b/i, group: "Bags", category: "Backpacks" },
  { pattern: /\b(duffle|duffel)\b/i, group: "Bags", category: "Duffles" },
  { pattern: /\b(crossbody)\b/i, group: "Bags", category: "Crossbody Bags" },
  { pattern: /\b(bag|pouch)\b/i, group: "Bags", category: "Pouches" },
  { pattern: /\b(necklace|chain)\b/i, group: "Jewelry", category: "Necklaces" },
  { pattern: /\b(bracelet)\b/i, group: "Jewelry", category: "Bracelets" },
  { pattern: /\b(ring)\b/i, group: "Jewelry", category: "Rings" },
  { pattern: /\b(earring)\b/i, group: "Jewelry", category: "Earrings" },
  { pattern: /\b(watch)\b/i, group: "Jewelry", category: "Watches" },
  { pattern: /\b(sticker|decal)\b/i, group: "Accessories", category: "Decals and Stickers" },
  { pattern: /\b(towel)\b/i, group: "Accessories", category: "Towels" },
  { pattern: /\b(gift card)\b/i, group: "Other", category: "Gift Cards" },
  { pattern: /\b(skateboard|skate board|deck)\b/i, group: "Collectibles", category: "Skate Boards" },
  { pattern: /\b(plush)\b/i, group: "Collectibles", category: "Plushes" },
  { pattern: /\b(book)\b/i, group: "Media", category: "Books" },
  { pattern: /\b(magazine)\b/i, group: "Media", category: "Magazines" },
  { pattern: /\b(print|poster)\b/i, group: "Art", category: "Prints" },
];

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[_&/-]+/g, " ").replace(/\s+/g, " ");
}

function cleanTags(values: string[]): StreetTag[] {
  const allowed = new Set<string>(STREET_TAGS);
  return [...new Set(values.map(normalize).filter((value) => allowed.has(value)))] as StreetTag[];
}

function cleanColors(values: string[]): StreetColor[] {
  const text = values.join(" ").toLowerCase();
  return STREET_COLORS.filter((color) => new RegExp(`\\b${color}\\b`, "i").test(text)).slice(0, 3) as StreetColor[];
}

function broadFallback(product: QueuedProduct): ProductClassification {
  const source = product.category?.trim() ?? "";
  const exactCategory = ALL_STREET_CATEGORIES.find((category) => normalize(category) === normalize(source));
  if (exactCategory) {
    const group = groupForStreetCategory(exactCategory);
    if (group) {
      return { group, category: exactCategory, type: null, detail: null, activity: null, tags: cleanTags(product.tags ?? []), colors: cleanColors(product.colors ?? []), confidence: "low" };
    }
  }

  const haystack = [product.title, product.description, product.category, ...(product.tags ?? [])].join(" ");
  const rule = RULES.find((candidate) => candidate.pattern.test(haystack));
  if (rule) {
    return { group: rule.group, category: rule.category, type: rule.type ?? null, detail: null, activity: null, tags: cleanTags(product.tags ?? []), colors: cleanColors(product.colors ?? []), confidence: "low" };
  }

  // Street catalogs are overwhelmingly apparel. This is intentionally broad,
  // low-confidence, and visible in the review queue rather than left pending.
  return { group: "Apparel", category: "Tops", type: null, detail: null, activity: null, tags: cleanTags(product.tags ?? []), colors: cleanColors(product.colors ?? []), confidence: "low" };
}

async function classifyOne(product: QueuedProduct): Promise<RecoveryClassificationResult> {
  let lastError = "";
  for (let attempt = 1; attempt <= AI_ATTEMPTS; attempt += 1) {
    try {
      const { classification, model } = await classifyProductWithAI({
        title: product.title,
        description: product.description,
        sourceCategory: product.category,
        sourceTags: product.tags ?? [],
        sourceColors: product.colors ?? [],
      });
      const status = classification.confidence === "low" ? "needs_review" : "classified";
      await saveClassification(product.id, classification, status, model, null);
      return { id: product.id, title: product.title, status, group: classification.group, category: classification.category, usedFallback: false };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "AI classification failed";
    }
  }

  // Model/provider fallback is already attempted by OpenRouter. If every model
  // is unavailable or the listing is malformed, finish the queue item with a
  // conservative low-confidence category so one bad product cannot block all
  // later products. It remains visible in the admin review queue.
  const fallback = broadFallback(product);
  await saveClassification(product.id, fallback, "needs_review", "street/broad-fallback-v2", `AI models failed: ${lastError}`);
  return { id: product.id, title: product.title, status: "needs_review", group: fallback.group, category: fallback.category, usedFallback: true };
}

async function saveClassification(id: string, classification: ProductClassification, status: "classified" | "needs_review", model: string, note: string | null) {
  await supabaseRest(`products?id=eq.${id}`, {
    method: "PATCH",
    body: {
      street_group: classification.group,
      street_category: classification.category,
      street_type: classification.type,
      street_detail: classification.detail,
      street_activity: classification.activity,
      street_tags: classification.tags,
      street_colors: classification.colors,
      classification_status: status,
      classification_confidence: classification.confidence,
      classification_model: model,
      classification_version: 4,
      classified_at: new Date().toISOString(),
      classification_error: note,
    },
    prefer: "return=minimal",
  });
}

async function mapConcurrent<T, R>(items: T[], limit: number, callback: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await callback(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function recoverQueuedClassifications(requestedLimit = CLASSIFICATION_BATCH_MAX, brandSlug?: string) {
  if (!hasSupabaseCatalog()) throw new Error("Supabase is not configured.");
  const limit = Math.max(1, Math.min(CLASSIFICATION_BATCH_MAX, Math.floor(requestedLimit)));
  const params = new URLSearchParams();
  params.set("select", brandSlug ? "id,title,description,category,tags,colors,brands!inner(slug)" : "id,title,description,category,tags,colors");
  params.set("or", "(classification_status.eq.pending,classification_status.eq.error)");
  params.set("is_active", "eq.true");
  params.set("order", "created_at.asc");
  params.set("limit", String(limit));
  if (brandSlug) params.set("brands.slug", `eq.${brandSlug}`);

  const queued = await supabaseRest<QueuedProduct[]>(`products?${params.toString()}`, { noStore: true });
  const results = await mapConcurrent(queued, CLASSIFICATION_CONCURRENCY, classifyOne);
  return { limit, found: queued.length, results, fallbackCount: results.filter((result) => result.usedFallback).length };
}

/**
 * Claims the singleton database lease, runs one bounded batch, and releases the
 * lease. Every caller — cron, chained worker, or admin retry — uses this entry
 * point so overlapping imports cannot classify the same products twice.
 */
export async function runClassificationWorkerBatch(requestedLimit = CLASSIFICATION_BATCH_MAX, brandSlug?: string) {
  if (!hasSupabaseCatalog()) throw new Error("Supabase is not configured.");
  const owner = randomUUID();
  const acquired = await supabaseRest<boolean>("rpc/claim_classification_worker", {
    method: "POST",
    body: { p_owner: owner, p_lease_seconds: WORKER_LEASE_SECONDS },
  });

  if (!acquired) {
    return { limit: Math.min(requestedLimit, CLASSIFICATION_BATCH_MAX), found: 0, results: [] as RecoveryClassificationResult[], fallbackCount: 0, busy: true };
  }

  let processed = 0;
  let failure: string | null = null;
  try {
    const run = await recoverQueuedClassifications(requestedLimit, brandSlug);
    processed = run.results.length;
    return { ...run, busy: false };
  } catch (error) {
    failure = error instanceof Error ? error.message : "Classification worker failed";
    throw error;
  } finally {
    await supabaseRest("rpc/finish_classification_worker", {
      method: "POST",
      body: { p_owner: owner, p_processed: processed, p_error: failure },
      prefer: "return=minimal",
    }).catch((error) => console.error("Unable to release Street classification worker lease", error));
  }
}
