"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseRest, CATALOG_CACHE_TAG, CATALOG_REVALIDATE_SECONDS } from "@/lib/supabase-rest";
import { uploadSiteAsset } from "@/lib/supabase-storage";
import { getBrandBySlug, syncSingleBrand } from "@/lib/catalog-store";
import { triggerClassificationDrain } from "@/lib/classification-trigger";
import { findBrandLogo } from "@/lib/brand-logo-finder";

export async function updateBrand(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) throw new Error("Missing brand slug.");

  const storeUrl = String(formData.get("store_url") ?? "").trim();
  const logoUrlInput = String(formData.get("logo_url") ?? "").trim();
  const featured = formData.get("is_featured") === "on";
  const catalogEnabled = formData.get("catalog_enabled") === "on";
  const logoInvert = formData.get("logo_invert") === "on";
  const logoFile = formData.get("logo_file");

  let logoUrl = logoUrlInput || null;
  if (logoFile instanceof File && logoFile.size > 0) {
    logoUrl = await uploadSiteAsset(logoFile, `brand-logos/${slug}`);
  }

  const body: Record<string, unknown> = { is_featured: featured, catalog_enabled: catalogEnabled, logo_invert: logoInvert };
  if (storeUrl) body.store_url = storeUrl;
  // Only touch logo_url if the admin actually provided one (typed a URL or
  // uploaded a file) — an empty field means "leave the scraped logo alone".
  if (logoUrlInput || logoFile instanceof File) body.logo_url = logoUrl;

  await supabaseRest(`brands?slug=eq.${encodeURIComponent(slug)}`, { method: "PATCH", body, prefer: "return=minimal" });

  // getBrandDirectory's brand read is cached under CATALOG_CACHE_TAG (see
  // lib/supabase-rest.ts), same as every other catalog read -- without
  // busting it here, the admin brands list redirect below re-renders from
  // a stale cached read (up to an hour old) and a just-saved change (like
  // the logo-invert checkbox) appears to silently revert.
  revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
  revalidatePath("/admin/brands");
  revalidatePath("/brands");
  revalidatePath("/");
  redirect(`/admin/brands?saved=${encodeURIComponent(slug)}`);
}

/**
 * Re-runs the same heuristic-then-AI-fallback logo finder used by the "add
 * new brand" wizard, but for a brand that's already been onboarded — for
 * when the scraped/manually-set logo is wrong, missing, or the brand's site
 * has since redesigned. Shows the result inline on this row for approval
 * rather than saving it immediately.
 */
export async function findLogoForBrand(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) throw new Error("Missing brand slug.");
  const brand = await getBrandBySlug(slug);
  if (!brand) throw new Error("Brand not found.");

  const candidate = await findBrandLogo(brand.storeUrl);
  const params = new URLSearchParams();
  if (candidate) {
    params.set("logoCandidateSlug", slug);
    params.set("logoCandidate", candidate.url);
    params.set("logoCandidateSource", candidate.source);
  } else {
    params.set("logoNotFoundSlug", slug);
  }
  redirect(`/admin/brands?${params.toString()}#${encodeURIComponent(slug)}`);
}

/** Admin approved a logo candidate found via findLogoForBrand above. */
export async function approveFoundLogo(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const candidate = String(formData.get("candidate") ?? "").trim();
  const logoInvert = formData.get("logo_invert") === "on";
  if (!slug || !candidate) throw new Error("Missing logo candidate.");

  await supabaseRest(`brands?slug=eq.${encodeURIComponent(slug)}`, { method: "PATCH", body: { logo_url: candidate, logo_invert: logoInvert }, prefer: "return=minimal" });

  revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
  revalidatePath("/admin/brands");
  revalidatePath("/brands");
  revalidatePath("/");
  redirect(`/admin/brands?saved=${encodeURIComponent(slug)}`);
}

/**
 * Re-sync one brand, then hand all queued products to the same global worker
 * used by onboarding and cron. The trigger returns immediately; bounded worker
 * invocations continue until the oldest-first queue is empty.
 */
export async function syncBrandNow(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) throw new Error("Missing brand slug.");
  const brand = await getBrandBySlug(slug);
  if (!brand) throw new Error("Brand not found.");

  const result = await syncSingleBrand(brand);
  if (result.ok) {
    revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
    await triggerClassificationDrain().catch((error) => console.error("Unable to start Street classification drain", error));
  }

  revalidatePath("/admin/brands");
  redirect(`/admin/brands?synced=${encodeURIComponent(slug)}${result.ok ? `&classifying=${encodeURIComponent(slug)}` : `&syncError=${encodeURIComponent(result.error ?? "Sync failed")}`}`);
}
