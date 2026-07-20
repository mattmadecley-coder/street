import { getBrandBySlug } from "@/lib/catalog-store";
import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";

type ProductIntentSnapshot = {
  id: string;
  title: string;
  price: number | string;
};

export async function resolveOutboundDestination(brandSlug: string | null, rawUrl: string | null): Promise<URL | null> {
  if (!brandSlug || !rawUrl) return null;
  const brand = await getBrandBySlug(brandSlug);
  if (!brand) return null;

  let destination: URL;
  let brandHost: URL;
  try {
    destination = new URL(rawUrl);
    brandHost = new URL(brand.storeUrl);
  } catch {
    return null;
  }

  if (destination.protocol !== "https:") return null;
  if (destination.hostname !== brandHost.hostname) return null;
  return destination;
}

async function resolveProductIntentSnapshot(brandSlug: string, productSlug?: string) {
  if (!hasSupabaseCatalog() || !productSlug) return null;
  const prefix = `${brandSlug}--`;
  const handle = productSlug.startsWith(prefix) ? productSlug.slice(prefix.length) : productSlug;
  if (!handle) return null;

  try {
    const rows = await supabaseRest<ProductIntentSnapshot[]>(
      `products?select=id,title,price,brands!inner(slug)&handle=eq.${encodeURIComponent(handle)}&brands.slug=eq.${encodeURIComponent(brandSlug)}&limit=1`,
      { noStore: true },
    );
    return rows[0] ?? null;
  } catch (error) {
    console.error("Street outbound product snapshot lookup failed", error);
    return null;
  }
}

export async function logOutboundClick(input: {
  brandSlug: string;
  productSlug?: string;
  destinationUrl: string;
  anonymousUserId?: string | null;
  sessionId?: string | null;
  sourceComponent?: string | null;
  sourcePath?: string | null;
  searchQuery?: string | null;
  position?: number | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!hasSupabaseCatalog() || !input.anonymousUserId?.trim() || !input.sessionId?.trim()) return;
  try {
    const product = await resolveProductIntentSnapshot(input.brandSlug, input.productSlug);
    await supabaseRest("outbound_clicks", {
      method: "POST",
      body: {
        product_id: product?.id ?? null,
        brand_slug: input.brandSlug,
        product_slug: input.productSlug ?? null,
        product_title: product?.title ?? null,
        product_price: product ? Number(product.price) : null,
        destination_url: input.destinationUrl,
        anonymous_user_id: input.anonymousUserId,
        session_id: input.sessionId,
        source_component: input.sourceComponent ?? null,
        source_path: input.sourcePath ?? null,
        search_query: input.searchQuery ?? null,
        position: input.position ?? null,
        referrer: input.referrer ?? null,
        utm_source: input.utmSource ?? null,
        utm_medium: input.utmMedium ?? null,
        utm_campaign: input.utmCampaign ?? null,
        metadata: input.metadata ?? {},
      },
      prefer: "return=minimal",
    });
  } catch (error) {
    console.error("Street outbound click logging failed", error);
  }
}
