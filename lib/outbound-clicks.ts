import { getBrandBySlug } from "@/lib/catalog-store";
import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";

export async function resolveOutboundDestination(brandSlug: string | null, rawUrl: string | null): Promise<URL | null> {
  if (!brandSlug || !rawUrl) return null;
  // DB-aware lookup (not just the static seed list) so brands added through
  // /admin/brands/new work here too, not just the original launch brands.
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

  // Only ever redirect to the brand's own domain. This is the guardrail that
  // keeps this route from becoming an open redirect.
  if (destination.protocol !== "https:") return null;
  if (destination.hostname !== brandHost.hostname) return null;
  return destination;
}

export async function logOutboundClick(input: { brandSlug: string; productSlug?: string; destinationUrl: string }) {
  if (!hasSupabaseCatalog()) return;
  try {
    await supabaseRest(
      "outbound_clicks",
      {
        method: "POST",
        body: { brand_slug: input.brandSlug, product_slug: input.productSlug ?? null, destination_url: input.destinationUrl },
        prefer: "return=minimal",
      }
    );
  } catch (error) {
    // Never let click logging block or break the redirect itself.
    console.error("Street outbound click logging failed", error);
  }
}
