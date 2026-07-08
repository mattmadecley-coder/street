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
  imageUrl: string | null;
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

const model = () => process.env.STREET_CLASSIFIER_MODEL ?? "qwen/qwen3-vl-30b-a3b-instruct";
const groups = Object.keys(STREET_TAXONOMY);

const classificationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    group: { type: "string", enum: groups },
    category: { type: "string", enum: ALL_STREET_CATEGORIES },
    type: { type: ["string", "null"], enum: [...ALL_STREET_TYPES, null] },
    detail: { type: ["string", "null"], enum: [...ALL_STREET_DETAILS, null] },
    activity: { type: ["string", "null"], enum: [...FOOTWEAR_ACTIVITIES, null] },
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
  const rawType = typeof candidate.type === "string" ? candidate.type : null;
  const type = rawType && isStreetType(group, category, rawType) ? rawType : null;

  const rawDetail = typeof candidate.detail === "string" ? candidate.detail : null;
  const detail = type && rawDetail && isStreetDetail(group, category, type, rawDetail) ? rawDetail : null;

  const rawActivity = typeof candidate.activity === "string" ? candidate.activity : null;
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
  const userContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "low" } }> = [
    { type: "text", text: productContext },
  ];
  if (product.imageUrl?.startsWith("https://")) userContent.push({ type: "image_url", image_url: { url: product.imageUrl, detail: "low" } });

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
          content: `You classify independent streetwear catalog products for Street, using GOAT's product taxonomy. Inspect the product image when it is provided, then combine that visual evidence with title, description, source category, source tags, and source colors.

Select exactly one "group" (top-level) and one "category" (second-level) from the Street taxonomy below. The category must belong to its selected group.

If the category breaks down further, also select a "type" (third-level) that belongs to that category — otherwise set type to null. If that type breaks down further, also select a "detail" (fourth-level) that belongs to that type — otherwise set detail to null. Do not guess a type or detail that isn't listed under the selected category/type; leave it null instead.

If group is "Footwear", also select an "activity" from: ${FOOTWEAR_ACTIVITIES.join(", ")} — describing how the shoe is primarily worn/marketed (e.g. Running, Basketball, Skateboarding, Lifestyle). Set activity to null for every other group.

Select only tags from the approved tag list. Do not create tags. Do not infer a tag that is not reasonably supported by text or image evidence. If the product is ambiguous, choose the best allowed category and set confidence to low.

Street taxonomy (Group: Category: Type (Detail, Detail...)):
${taxonomyPrompt}

Approved tags:
${STREET_TAGS.join(", ")}

Approved colors:
${STREET_COLORS.join(", ")}`,
        },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "street_product_classification",
          strict: true,
          schema: classificationSchema,
        },
      },
    }),
  });

  const payload = (await response.json()) as OpenRouterResponse;
  if (!response.ok) throw new Error(payload.error?.message ?? `OpenRouter classification request failed (${response.status}).`);
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI classification returned no content.");

  return { classification: validateClassification(JSON.parse(content)), model: payload.model ?? classifierModel };
}
