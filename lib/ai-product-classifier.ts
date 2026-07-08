import {
  ALL_STREET_CATEGORIES,
  ALL_STREET_DETAILS,
  ALL_STREET_TYPES,
  FOOTWEAR_ACTIVITIES,
  STREET_COLORS,
  STREET_TAGS,
  STREET_TAXONOMY,
  groupForStreetCategory,
  isFootwearActivity,
  isStreetCategory,
  isStreetDetail,
  isStreetGroup,
  isStreetType,
  type FootwearActivity,
  type StreetColor,
  type StreetGroup,
  type StreetTag,
} from "@/lib/street-taxonomy";

type ProductToClassify = {
  title: string;
  description: string;
  sourceCategory: string;
  sourceTags: string[];
  sourceColors: string[];
  /** Every available product photo (primary + gallery), in display order. */
  imageUrls: string[];
};

export type ProductClassification = {
  group: StreetGroup;
  category: string;
  /** Level-3. Null when the item doesn't need a finer breakdown or the model didn't have one to offer. */
  type: string | null;
  /** Level-4. Only ever set alongside a valid `type`. */
  detail: string | null;
  /** Footwear-only facet (Running, Basketball, etc). Always null outside the Footwear group. */
  activity: FootwearActivity | null;
  tags: StreetTag[];
  colors: StreetColor[];
  confidence: "high" | "medium" | "low";
};

type OpenRouterResponse = {
  error?: { message?: string };
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
};

// Switched from qwen3-vl-30b-a3b-instruct: that model was confidently
// mis-grouping plain apparel (hoodies -> Hats, sweatpants -> Sneakers, a
// jersey -> Bags) even with multiple high-detail images. Gemini 2.5 Flash is
// a meaningfully stronger vision model at a still-low per-image cost.
const model = () => process.env.STREET_CLASSIFIER_MODEL ?? "google/gemini-3-flash";
const groups = Object.keys(STREET_TAXONOMY);

// "none" sentinel instead of a `["string","null"]` nullable-union type:
// OpenRouter's structured-output compatibility layer for Gemini doesn't
// reliably support nullable unions in a JSON schema (it either 500s or
// silently returns empty content) — a plain string enum with a literal
// "none" value works the same for our purposes and is portable across models.
const classificationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    group: { type: "string", enum: groups },
    category: { type: "string", enum: ALL_STREET_CATEGORIES },
    type: { type: "string", enum: [...ALL_STREET_TYPES, "none"] },
    detail: { type: "string", enum: [...ALL_STREET_DETAILS, "none"] },
    activity: { type: "string", enum: [...FOOTWEAR_ACTIVITIES, "none"] },
    tags: { type: "array", items: { type: "string", enum: STREET_TAGS }, maxItems: 12 },
    colors: { type: "array", items: { type: "string", enum: STREET_COLORS }, maxItems: 3 },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["group", "category", "type", "detail", "activity", "tags", "colors", "confidence"],
} as const;

/** Compact text form of the taxonomy tree for the system prompt. */
function describeTaxonomy(): string {
  return Object.entries(STREET_TAXONOMY)
    .map(([group, categories]) => {
      const categoryLines = Object.entries(categories as Record<string, Record<string, readonly string[]>>)
        .map(([category, types]) => {
          const typeEntries = Object.entries(types);
          if (!typeEntries.length) return `  - ${category}`;
          const typesText = typeEntries
            .map(([type, details]) => (Array.isArray(details) && details.length ? `${type} (${details.join(", ")})` : type))
            .join("; ");
          return `  - ${category}: ${typesText}`;
        })
        .join("\n");
      return `${group}:\n${categoryLines}`;
    })
    .join("\n\n");
}

const taxonomyPrompt = describeTaxonomy();

function cleanList(values: unknown, allowed: readonly string[]) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === "string" && allowed.includes(value)))];
}

function validateClassification(value: unknown): ProductClassification {
  if (!value || typeof value !== "object") throw new Error("Classifier returned an invalid object.");
  const candidate = value as Record<string, unknown>;

  if (typeof candidate.group !== "string" || !isStreetGroup(candidate.group)) throw new Error("Classifier returned an invalid Street group.");
  if (typeof candidate.category !== "string") throw new Error("Classifier returned an invalid category.");
  if (candidate.confidence !== "high" && candidate.confidence !== "medium" && candidate.confidence !== "low") throw new Error("Classifier returned an invalid confidence level.");

  let group = candidate.group;
  const category = candidate.category;
  let confidence: "high" | "medium" | "low" = candidate.confidence;

  // The model sometimes names a real category but pairs it with the wrong
  // group (e.g. group: "Accessories", category: "Sneakers"). Category names
  // are unique across the whole tree, so recover the correct group instead
  // of throwing the classification away — just mark it down for review.
  if (!isStreetCategory(group, category)) {
    const correctedGroup = groupForStreetCategory(category);
    if (!correctedGroup) throw new Error(`Classifier returned category "${category}", which doesn't exist under any group.`);
    group = correctedGroup;
    confidence = "low";
  }

  // Deeper levels degrade gracefully instead of failing the whole
  // classification: a model that nails group/category but picks a type that
  // doesn't belong under that category just loses the type, rather than
  // the product going unclassified.
  const rawType = typeof candidate.type === "string" && candidate.type !== "none" ? candidate.type : null;
  const type = rawType && isStreetType(group, category, rawType) ? rawType : null;

  const rawDetail = typeof candidate.detail === "string" && candidate.detail !== "none" ? candidate.detail : null;
  const detail = type && rawDetail && isStreetDetail(group, category, type, rawDetail) ? rawDetail : null;

  const rawActivity = typeof candidate.activity === "string" && candidate.activity !== "none" ? candidate.activity : null;
  const activity = group === "Footwear" && rawActivity && isFootwearActivity(rawActivity) ? rawActivity : null;

  return {
    group,
    category,
    type,
    detail,
    activity,
    tags: cleanList(candidate.tags, STREET_TAGS) as StreetTag[],
    colors: cleanList(candidate.colors, STREET_COLORS) as StreetColor[],
    confidence,
  };
}

export async function classifyProductWithAI(product: ProductToClassify): Promise<{ classification: ProductClassification; model: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("AI classification is not configured. Add OPENROUTER_API_KEY in Vercel before running the classifier.");

  const classifierModel = model();
  const productContext = JSON.stringify({
    title: product.title,
    description: product.description.slice(0, 4000),
    sourceCategory: product.sourceCategory,
    sourceTags: product.sourceTags.slice(0, 30),
    sourceColors: product.sourceColors.slice(0, 10),
  });
  const userContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "high" } }> = [
    { type: "text", text: productContext },
  ];
  // "high" detail costs more per call than the "low" this used to run at,
  // but a spot-check against real catalog images showed "low" led the model
  // to guess badly on anything that wasn't an obvious t-shirt/hoodie shape.
  // Sending every photo (not just the primary one) gives the model multiple
  // angles of the same item — a single studio shot was still producing
  // confident, flatly wrong group/category picks (e.g. sweatpants -> Footwear).
  for (const url of product.imageUrls) {
    if (url.startsWith("https://")) userContent.push({ type: "image_url", image_url: { url, detail: "high" } });
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://street-beryl.vercel.app",
      "X-OpenRouter-Title": "Street catalog classifier",
    },
    body: JSON.stringify({
      model: classifierModel,
      temperature: 0,
      max_tokens: 500,
      provider: { require_parameters: true, sort: "price" },
      messages: [
        {
          role: "system",
          content: `You classify independent streetwear catalog products for Street, using GOAT's product taxonomy. You will typically be shown several photos of the same physical product (different angles, folded vs. worn, close-ups of prints). Look at all of them together before deciding — they are all the same item, not different items. The images are the primary evidence. Title, description, source category, and source tags come from the merchant's own store and are frequently generic, wrong, or misleading (a merchant will dump unrelated items like balls, towels, or equipment into an "Apparel" or "Accessories" bucket just because that's the only collection they made). Never let a mismatched source category override what the images actually show, and never guess a group/category that isn't clearly visible in at least one of the photos — if every photo genuinely shows a pair of pants, the group cannot be Footwear or Bags, no matter what.

Select exactly one "group" (top-level) and one "category" (second-level) from the Street taxonomy below. The category must belong to its selected group. Pick the category that matches what the object literally is — a football is a football (Sports: Football), a towel is a towel (Accessories: Towels), a basketball is a basketball (Sports: Basketball) — do not force a literal piece of sporting equipment or a textile item into Apparel or Footwear just because the brand or listing text suggests clothing. Only classify as apparel/footwear if the image shows a wearable garment or shoe.

If the category breaks down further, also select a "type" (third-level) that belongs to that category — otherwise set type to the literal string "none". If that type breaks down further, also select a "detail" (fourth-level) that belongs to that type — otherwise set detail to "none". Do not guess a type or detail that isn't listed under the selected category/type; use "none" instead.

If group is "Footwear", also select an "activity" from: ${FOOTWEAR_ACTIVITIES.join(", ")} — describing how the shoe is primarily worn/marketed (e.g. Running, Basketball, Skateboarding, Lifestyle). Set activity to "none" for every other group.

Select only tags from the approved tag list. Do not create tags. Do not infer a tag that is not reasonably supported by text or image evidence. If nothing in the taxonomy is a clean literal match for what the image shows, choose the closest allowed category and set confidence to low rather than defaulting to Apparel.

Street taxonomy (Group: Category: Type (Detail, Detail...)):
${taxonomyPrompt}

Approved tags:
${STREET_TAGS.join(", ")}

Approved colors:
${STREET_COLORS.join(", ")}

Respond with ONLY a single raw JSON object — no markdown code fences, no commentary before or after. It must have exactly these keys: "group" (string), "category" (string), "type" (string, or "none"), "detail" (string, or "none"), "activity" (string, or "none"), "tags" (array of strings, up to 12), "colors" (array of strings, up to 3), "confidence" ("high", "medium", or "low"). Every string value must be copied exactly (case-sensitive) from the approved lists above — never invent a value that isn't in those lists.`,
        },
        { role: "user", content: userContent },
      ],
      // Plain JSON mode instead of a strict json_schema: Gemini's schema-constrained
      // decoding rejects this schema outright ("too much branching for serving")
      // once type/detail enums cover the full 4-level taxonomy (hundreds of values).
      // validateClassification() below already does full manual validation with
      // graceful degradation, so we don't depend on provider-side schema enforcement.
      response_format: { type: "json_object" },
    }),
  });

  const payload = (await response.json()) as OpenRouterResponse;
  // TEMP DIAGNOSTIC: include the full error payload, not just .message —
  // OpenRouter's generic "Provider returned error" hides the real cause.
  if (!response.ok) throw new Error(`OpenRouter request failed (${response.status}): ${JSON.stringify(payload).slice(0, 1500)}`);
  const content = payload.choices?.[0]?.message?.content;
  // TEMP DIAGNOSTIC: surface the raw payload when content is missing so we
  // can see refusals / finish_reason / provider errors instead of a blind
  // "no content" message. Remove once the Gemini switch is confirmed stable.
  if (!content) throw new Error(`AI classification returned no content. Raw payload: ${JSON.stringify(payload).slice(0, 1500)}`);

  // Without strict schema enforcement the model occasionally wraps the JSON in
  // a markdown code fence despite instructions not to — strip it before parsing.
  const jsonText = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    const message = error instanceof Error ? error.message : "JSON parse failed";
    // TEMP DIAGNOSTIC: include the raw text that failed to parse.
    throw new Error(`${message}. Raw content: ${jsonText.slice(0, 800)}`);
  }
  return { classification: validateClassification(parsed), model: payload.model ?? classifierModel };
}
