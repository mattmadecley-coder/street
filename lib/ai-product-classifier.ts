import {
  STREET_COLORS,
  STREET_TAGS,
  STREET_TAXONOMY,
  isStreetCategoryForGroup,
  isStreetGroup,
  type StreetCategory,
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
  category: StreetCategory;
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
const categories = Object.values(STREET_TAXONOMY).flat() as string[];

const classificationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    group: { type: "string", enum: groups },
    category: { type: "string", enum: categories },
    tags: { type: "array", items: { type: "string", enum: STREET_TAGS }, maxItems: 8 },
    colors: { type: "array", items: { type: "string", enum: STREET_COLORS }, maxItems: 3 },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["group", "category", "tags", "colors", "confidence"],
} as const;

const taxonomyPrompt = Object.entries(STREET_TAXONOMY)
  .map(([group, entries]) => `${group}: ${entries.join(", ")}`)
  .join("\n");

function cleanList(values: unknown, allowed: readonly string[]) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === "string" && allowed.includes(value)))];
}

function groupCandidatesForCategory(category: string) {
  return Object.entries(STREET_TAXONOMY)
    .filter(([, entries]) => (entries as readonly string[]).includes(category))
    .map(([group]) => group as StreetGroup);
}

function repairGroupCategoryPair(group: StreetGroup, category: string) {
  if (isStreetCategoryForGroup(group, category)) return { group, category: category as StreetCategory };
  const candidates = groupCandidatesForCategory(category);
  if (candidates.length) return { group: candidates[0], category: category as StreetCategory };
  return { group: "Other" as StreetGroup, category: "Other" as StreetCategory };
}

function validateClassification(value: unknown): ProductClassification {
  if (!value || typeof value !== "object") throw new Error("Classifier returned an invalid object.");
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.group !== "string" || !isStreetGroup(candidate.group)) throw new Error("Classifier returned an invalid Street group.");
  if (typeof candidate.category !== "string") throw new Error("Classifier returned an invalid Street category.");
  if (candidate.confidence !== "high" && candidate.confidence !== "medium" && candidate.confidence !== "low") throw new Error("Classifier returned an invalid confidence level.");

  const repaired = repairGroupCategoryPair(candidate.group, candidate.category);

  return {
    group: repaired.group,
    category: repaired.category,
    tags: cleanList(candidate.tags, STREET_TAGS) as StreetTag[],
    colors: cleanList(candidate.colors, STREET_COLORS) as StreetColor[],
    confidence: candidate.confidence,
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
          content: `You classify independent streetwear catalog products for Street. Inspect the product image first when it is provided. Use the image as the strongest evidence for visible category, color, pattern, fit, material, and style details. Use the title, description, source category, source tags, and source colors as supporting context. Select exactly one group and one category from the Street taxonomy below. The category must belong to its selected group. Select only tags from the approved tag list. Do not create new tags. Choose the tags that will make the product easiest to discover in search and filters. Prefer 3-8 useful tags. Let the product image decide the final colors when it is available and clear; brand-provided colors are only context and may be wrong or incomplete. Use high confidence when the image and text give a clear answer, medium when some details are uncertain, and low when the image is missing, blurry, or ambiguous. If a product does not clearly fit any listed category, use Other > Other rather than inventing a category.\n\nStreet taxonomy:\n${taxonomyPrompt}\n\nApproved tags:\n${STREET_TAGS.join(", ")}\n\nApproved colors:\n${STREET_COLORS.join(", ")}`,
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

  const payload = await response.json() as OpenRouterResponse;
  if (!response.ok) throw new Error(payload.error?.message ?? `OpenRouter classification request failed (${response.status}).`);
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI classification returned no content.");

  return { classification: validateClassification(JSON.parse(content)), model: payload.model ?? classifierModel };
}
