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
};

export type ProductClassification = {
  group: StreetGroup;
  category: StreetCategory;
  tags: StreetTag[];
  colors: StreetColor[];
  confidence: "high" | "medium" | "low";
};

const model = () => process.env.STREET_CLASSIFIER_MODEL ?? "gpt-4o-mini";
const groups = Object.keys(STREET_TAXONOMY);
const categories = Object.values(STREET_TAXONOMY).flat() as string[];

const classificationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    group: { type: "string", enum: groups },
    category: { type: "string", enum: categories },
    tags: { type: "array", items: { type: "string", enum: STREET_TAGS }, maxItems: 12 },
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

function validateClassification(value: unknown): ProductClassification {
  if (!value || typeof value !== "object") throw new Error("Classifier returned an invalid object.");
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.group !== "string" || !isStreetGroup(candidate.group)) throw new Error("Classifier returned an invalid Street group.");
  if (typeof candidate.category !== "string" || !isStreetCategoryForGroup(candidate.group, candidate.category)) throw new Error("Classifier returned a category outside its allowed group.");
  if (candidate.confidence !== "high" && candidate.confidence !== "medium" && candidate.confidence !== "low") throw new Error("Classifier returned an invalid confidence level.");

  return {
    group: candidate.group,
    category: candidate.category,
    tags: cleanList(candidate.tags, STREET_TAGS) as StreetTag[],
    colors: cleanList(candidate.colors, STREET_COLORS) as StreetColor[],
    confidence: candidate.confidence,
  };
}

export async function classifyProductWithAI(product: ProductToClassify): Promise<{ classification: ProductClassification; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("AI classification is not configured. Add OPENAI_API_KEY in Vercel before running the classifier.");

  const classifierModel = model();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: classifierModel,
      temperature: 0,
      store: false,
      messages: [
        {
          role: "system",
          content: `You classify independent streetwear catalog products for Street. Select exactly one group and one category from the Street taxonomy below. The category must belong to its selected group. Select only tags from the approved tag list. Do not create tags. Use title, description, source category, source tags, and source colors as evidence. Do not infer a tag that is not reasonably supported. If the product is ambiguous, choose the best allowed category and set confidence to low.\n\nStreet taxonomy:\n${taxonomyPrompt}\n\nApproved tags:\n${STREET_TAGS.join(", ")}\n\nApproved colors:\n${STREET_COLORS.join(", ")}`,
        },
        {
          role: "user",
          content: JSON.stringify({
            title: product.title,
            description: product.description.slice(0, 4000),
            sourceCategory: product.sourceCategory,
            sourceTags: product.sourceTags.slice(0, 30),
            sourceColors: product.sourceColors.slice(0, 10),
          }),
        },
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

  const payload = await response.json() as { error?: { message?: string }; choices?: Array<{ message?: { content?: string | null } }> };
  if (!response.ok) throw new Error(payload.error?.message ?? `OpenAI classification request failed (${response.status}).`);
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI classification returned no content.");

  return { classification: validateClassification(JSON.parse(content)), model: classifierModel };
}
