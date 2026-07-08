import { classifyProductWithAI, type ProductClassification } from "@/lib/ai-product-classifier";
import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";

type ImageRow = { source_url: string; sort_order: number };
type PendingPreviewRow = {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  colors: string[];
  primary_image_url: string | null;
  product_images: ImageRow[] | null;
};

const MAX_PREVIEW_IMAGES = 6;

export type ClassificationPreview = {
  id: string;
  title: string;
  imageUrl: string | null;
  sourceCategory: string;
  sourceTags: string[];
  sourceColors: string[];
  classification?: ProductClassification;
  model?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
  error?: string;
};

const MAX_PREVIEW_PRODUCTS = 5;

/**
 * Calls the AI classifier against real pending catalog products without making
 * any database writes. This is deliberately separate from the queue worker so
 * the model can be evaluated before classifications are saved.
 */
export async function previewPendingClassifications(requestedLimit?: number) {
  if (!hasSupabaseCatalog()) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

  const limit = Math.max(1, Math.min(MAX_PREVIEW_PRODUCTS, Math.floor(requestedLimit ?? 3)));
  const products = await supabaseRest<PendingPreviewRow[]>(
    `products?select=id,title,description,category,tags,colors,primary_image_url,product_images(source_url,sort_order)&product_images.order=sort_order.asc&classification_status=eq.pending&is_active=eq.true&order=created_at.asc&limit=${limit}`,
  );
  const results: ClassificationPreview[] = [];

  for (const product of products) {
    try {
      const galleryUrls = (product.product_images ?? []).sort((a, b) => a.sort_order - b.sort_order).map((image) => image.source_url);
      const imageUrls = [...new Set([product.primary_image_url, ...galleryUrls].filter((url): url is string => !!url))].slice(0, MAX_PREVIEW_IMAGES);
      const { classification, model, usage } = await classifyProductWithAI({
        title: product.title,
        description: product.description,
        sourceCategory: product.category,
        sourceTags: product.tags ?? [],
        sourceColors: product.colors ?? [],
        imageUrls,
      });
      results.push({
        id: product.id,
        title: product.title,
        imageUrl: product.primary_image_url,
        sourceCategory: product.category,
        sourceTags: product.tags ?? [],
        sourceColors: product.colors ?? [],
        classification,
        model,
        usage,
      });
    } catch (error) {
      results.push({
        id: product.id,
        title: product.title,
        imageUrl: product.primary_image_url,
        sourceCategory: product.category,
        sourceTags: product.tags ?? [],
        sourceColors: product.colors ?? [],
        error: error instanceof Error ? error.message : "AI classification preview failed",
      });
    }
  }

  return { dryRun: true, limit, found: products.length, results };
}
