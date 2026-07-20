import { getBrandBySlug } from "@/lib/catalog-store";
import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";

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
    await supabaseRest("outbound_clicks", {
      method: "POST",
      body: {
        brand_slug: input.brandSlug,
        product_slug: input.productSlug ?? null,
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
