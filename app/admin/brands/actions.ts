"use server";

import { after } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseRest, CATALOG_CACHE_TAG, CATALOG_REVALIDATE_SECONDS } from "@/lib/supabase-rest";
import { uploadSiteAsset } from "@/lib/supabase-storage";
import { getBrandBySlug, syncSingleBrand, classifyPendingProducts } from "@/lib/catalog-store";

export async function updateBrand(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) throw new Error("Missing brand slug.");

  const storeUrl = String(formData.get("store_url") ?? "").trim();
  const logoUrlInput = String(formData.get("logo_url") ?? "").trim();
  const featured = formData.get("is_featured") === "on";
  const catalogEnabled = formData.get("catalog_enabled") === "on";
  const logoFile = formData.get("logo_file");

  let logoUrl = logoUrlInput || null;
  if (logoFile instanceof File && logoFile.size > 0) {
    logoUrl = await uploadSiteAsset(logoFile, `brand-logos/${slug}`);
  }

  const body: Record<string, unknown> = { is_featured: featured, catalog_enabled: catalogEnabled };
  if (storeUrl) body.store_url = storeUrl;
  // Only touch logo_url if the admin actually provided one (typed a URL or
  // uploaded a file) — an empty field means "leave the scraped logo alone".
  if (logoUrlInput || logoFile instanceof File) body.logo_url = logoUrl;

  await supabaseRest(`brands?slug=eq.${encodeURIComponent(slug)}`, { method: "PATCH", body, prefer: "return=minimal" });

  revalidatePath("/brands");
  revalidatePath("/");
  redirect(`/admin/brands?saved=${encodeURIComponent(slug)}`);
}

/**
 * Manually re-syncs one brand's products right now, instead of waiting for
 * the next daily cron run. Import happens inline (so the admin sees the
 * result immediately), then classification of whatever just came in is
 * handed off to a background task. The Brands page only presents that task
 * as active for a short window; anything left pending is clearly labeled as
 * waiting and is also picked up by the classification recovery cron.
 */
export async function syncBrandNow(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) throw new Error("Missing brand slug.");
  const brand = await getBrandBySlug(slug);
  if (!brand) throw new Error("Brand not found.");

  const result = await syncSingleBrand(brand);
  if (result.ok) {
    revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });

    after(async () => {
      const deadline = Date.now() + 40_000;
      while (Date.now() < deadline) {
        const batch = await classifyPendingProducts(20, slug);
        if (!batch.results.length) break;
        revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
      }
    });
  }
  revalidatePath("/admin/brands");
  redirect(`/admin/brands?synced=${encodeURIComponent(slug)}${result.ok ? `&classifying=${encodeURIComponent(slug)}` : `&syncError=${encodeURIComponent(result.error ?? "Sync failed")}`}`);
}
