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
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

// Text-only, on a cheap OpenRouter model (DeepSeek by default) — no product
// photos are sent. This trades some accuracy on vague/generic listings for a
// large drop in per-classification cost: this used to send every product
// image ("high" detail, multiple photos per item) to a vision model, which
// is by far the most expensive part of a vision API call. Since merchant
// title/tags/category are the only signal now, classification leans harder
// on the taxonomy description and explicit "don't just trust the merchant's
// bucket" guidance below; confidence is set to "low" more readily than the
// old vision-based prompt did, so ambiguous items surface in /admin/products
// for a manual check instead of silently guessing.
const model = () => process.env.STREET_CLASSIFIER_MODEL ?? "deepseek/deepseek-chat";
const groups = Object.keys(STREET_TAXONOMY);

// "none" sentinel instead of a `["string","null"]` nullable-union type: some
// OpenRouter providers' structured-output layers don't reliably support
// nullable unions in a JSON schema — a plain string enum with a literal
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

export async function classifyProductWithAI(product: ProductToClassify): Promise<{ classification: ProductClassification; model: string; usage?: { promptTokens?: number; completionTokens?: number } }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("AI classification is not configured. Add OPENROUTER_API_KEY in Vercel before running the classifier.");

  const classifierModel = model();
  const productContext = JSON.stringify({
    title: product.title,
    description: product.description.slice(0, 2000),
    sourceCategory: product.sourceCategory,
    sourceTags: product.sourceTags.slice(0, 30),
    sourceColors: product.sourceColors.slice(0, 10),
  });

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://street-beryl.vercel.app",
      "X-OpenRouter-Title": "Street catalog classifier",
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: classifierModel,
      temperature: 0,
      max_tokens: 500,
      provider: { sort: "price" },
      messages: [
        {
          role: "system",
          content: `You classify independent streetwear catalog products for Street, using GOAT's product taxonomy. You are only given text: title, description, the merchant's own source category, and the merchant's own tags/colors — no photos. This text comes straight from each brand's own store and is frequently generic, incomplete, or actively misleading (a merchant will dump unrelated items like balls, towels, keychains, or equipment into a generic "Apparel" or "Accessories" collection just because that's the only collection they made). Never trust the merchant's source category on its own — read the title and description first and classify what the product actually, literally is. If the title/description clearly describe a football, classify it as a football (Sports: Football) even if the merchant's own category says "Apparel". If the text is too vague or generic to be confident (e.g. just a brand name and a color with no product-type word), pick your best guess among the closest allowed category and set confidence to "low" rather than defaulting to a common category like Apparel/T-Shirts.

Select exactly one "group" (top-level) and one "category" (second-level) from the Street taxonomy below. The category must belong to its selected group.

If the category breaks down further, also select a "type" (third-level) that belongs to that category — otherwise set type to the literal string "none". If that type breaks down further, also select a "detail" (fourth-level) that belongs to that type — otherwise set detail to "none". Do not guess a type or detail that isn't listed under the selected category/type; use "none" instead.

If group is "Footwear", also select an "activity" from: ${FOOTWEAR_ACTIVITIES.join(", ")} — describing how the shoe is primarily worn/marketed (e.g. Running, Basketball, Skateboarding, Lifestyle), inferred from the title/description. Set activity to "none" for every other group.

Select only tags from the approved tag list. Do not create tags. Do not infer a tag that is not reasonably supported by the text. Prefer fewer, well-supported tags over guessing.

Street taxonomy (Group: Category: Type (Detail, Detail...)):
${taxonomyPrompt}

Approved tags:
${STREET_TAGS.join(", ")}

Approved colors:
${STREET_COLORS.join(", ")}

Respond with ONLY a single raw JSON object — no markdown code fences, no commentary before or after. It must have exactly these keys: "group" (string), "category" (string), "type" (string, or "none"), "detail" (string, or "none"), "activity" (string, or "none"), "tags" (array of strings, up to 12), "colors" (array of strings, up to 3), "confidence" ("high", "medium", or "low"). Every string value must be copied exactly (case-sensitive) from the approved lists above — never invent a value that isn't in those lists.`,
        },
        { role: "user", content: productContext },
      ],
      // Plain JSON mode rather than a strict json_schema: once type/detail
      // enums cover the full 4-level taxonomy (hundreds of values), some
      // providers' schema-constrained decoding rejects the schema outright.
      // validateClassification() below already does full manual validation
      // with graceful degradation, so provider-side schema enforcement isn't required.
      response_format: { type: "json_object" },
    }),
  });

  const payload = (await response.json()) as OpenRouterResponse;
  if (!response.ok) throw new Error(`OpenRouter request failed (${response.status}): ${JSON.stringify(payload).slice(0, 1500)}`);
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error(`AI classification returned no content. Raw payload: ${JSON.stringify(payload).slice(0, 1500)}`);

  // Without strict schema enforcement the model occasionally wraps the JSON in
  // a markdown code fence despite instructions not to — strip it before parsing.
  const jsonText = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    const message = error instanceof Error ? error.message : "JSON parse failed";
    throw new Error(`${message}. Raw content: ${jsonText.slice(0, 800)}`);
  }
  return {
    classification: validateClassification(parsed),
    model: payload.model ?? classifierModel,
    usage: { promptTokens: payload.usage?.prompt_tokens, completionTokens: payload.usage?.completion_tokens },
  };
}
