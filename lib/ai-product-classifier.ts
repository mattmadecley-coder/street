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
    tags: { type: "array", items: { type: "string", enum: STREET_TAGS }, maxItems: 7 },
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
          content: `You classify independent streetwear catalog products for Street. Inspect the product image when it is provided, then combine that visual evidence with title, description, source category, source tags, and source colors. Select exactly one group and one category from the Street taxonomy below. The category must belong to its selected group. Select only tags from the approved tag list. Do not create tags. Prefer 3-6 strong tags over a long list.\n\nCategory rules:\n- If the title or sourceCategory says polo or rugby, use Apparel > Jerseys & Polos unless the image clearly shows a normal t-shirt.\n- If the title says jersey, use Apparel > Jerseys & Polos unless the title also says tee/t-shirt or the image clearly shows a tee.\n- If the title says zip-up or zip up and the image shows a hood or sweatshirt body, use Apparel > Hoodies & Sweatshirts.\n- If the title says sweatpants or joggers, use Bottoms > Sweatpants & Joggers.\n- If the title says double knee, carpenter, or denim pants, prefer Bottoms > Jeans unless the item is clearly not denim.\n- Do not put a rugby/polo under Long Sleeves just because it has long sleeves. Long Sleeves is for long-sleeve tees/shirts that are not polos, rugby shirts, sweaters, hoodies, or jackets.\n\nColor rules:\n- Use sourceColors as helpful context, but do not treat them as truth. Brand-provided colors are often incomplete or wrong.\n- Let the product image decide the final colors when it is available and clear.\n- Return one or two dominant colors unless the item is genuinely multicolor.\n- Use multicolor when the item has several equally important colors or an all-over pattern.\n\nStrict tag rules:\n- Tags must describe what is visually obvious or explicitly stated, not the brand vibe.\n- Never return both zip-up and pullover for the same product. Use zip-up if a full or partial zipper is visible/stated; use pullover only when there is no zipper and it is clearly a pullover.\n- Do not use suede, leather, faux-leather, wool, nylon, canvas, mesh, knit, jersey, cotton, fleece, denim, or other material tags unless the material is explicit in the title/description/source tags or very visually obvious.\n- Do not use washed, vintage-wash, acid-wash, faded, distressed, destroyed, bleached, raw-denim, light-wash, medium-wash, dark-wash, or sun-faded unless the title/description says it or the image clearly shows that finish.\n- Do not use fit tags like oversized, fitted, slim, baggy, cropped, straight-leg, wide-leg, flare, stacked, low-rise, high-rise, longline, or boxy unless the full garment shape is clearly visible or text-supported.\n- Do not use graphic just because an item has text, a logo, animal print, or a number. Use text-print for clear text, logo for clear brand/logo placement, animal-print for animal patterns, racing-graphic only for clear racing/motorsport graphics, and graphic only for a real non-text/non-logo illustration/design.\n- Do not use embroidered, rhinestone, studded, patchwork, panelled, frayed, raw-hem, double-knee, carpenter, cargo-pocket, or other construction/detail tags unless clearly visible or text-supported.\n- Do not use racing-graphic, military, workwear, utility, y2k, gothic, punk, skate, moto, or other aesthetic tags unless the product clearly shows that aesthetic or the title/description says it.\n- Set confidence to high only when the category, colors, and important tags are strongly supported. Use medium when details are uncertain. Use low when the image is missing, blurry, or the item is ambiguous.\n\nStreet taxonomy:\n${taxonomyPrompt}\n\nApproved tags:\n${STREET_TAGS.join(", ")}\n\nApproved colors:\n${STREET_COLORS.join(", ")}`,
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
