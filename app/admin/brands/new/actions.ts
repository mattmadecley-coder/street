"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createBrandDraft, findBrandByDomain, syncSingleBrand, setBrandCatalogEnabled, classifyPendingProducts, getBrandBySlug } from "@/lib/catalog-store";
import { findBrandLogo } from "@/lib/brand-logo-finder";
import { uploadSiteAsset } from "@/lib/supabase-storage";
import { supabaseRest, CATALOG_CACHE_TAG, CATALOG_REVALIDATE_SECONDS } from "@/lib/supabase-rest";
import { slugify, slugFromUrl } from "@/lib/slug";

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Step 1: create the brand row from a store URL (+ optional name), after checking no existing brand already has this domain. */
export async function startBrandOnboarding(formData: FormData) {
  const rawUrl = String(formData.get("store_url") ?? "").trim();
  const rawName = String(formData.get("name") ?? "").trim();

  let storeUrlInput = rawUrl;
  if (storeUrlInput && !/^https?:\/\//i.test(storeUrlInput)) storeUrlInput = `https://${storeUrlInput}`;
  const parsed = storeUrlInput ? tryParseUrl(storeUrlInput) : null;
  if (!parsed) {
    redirect(`/admin/brands/new?error=${encodeURIComponent("Enter a valid store URL.")}`);
    return;
  }
  const storeUrl = parsed.toString();

  const existing = await findBrandByDomain(storeUrl);
  if (existing) {
    redirect(`/admin/brands/new?error=${encodeURIComponent(`${existing.name} is already in Street's catalog (same domain: ${new URL(existing.storeUrl).hostname.replace(/^www\\./, "")}).`)}`);
    return;
  }

  const derived = slugFromUrl(storeUrl);
  const name = rawName || derived?.name || "New brand";
  const baseSlug = (rawName ? slugify(rawName) : derived?.slug) || `brand-${Date.now()}`;

  let slug = baseSlug;
  let attempt = 1;
  while (await getBrandBySlug(slug)) {
    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }

  await createBrandDraft({ slug, name, storeUrl });
  redirect(`/admin/brands/new?step=logo&slug=${encodeURIComponent(slug)}`);
}

/** Step 2a: run the (heuristic, then AI-fallback) logo finder and show the result for approval. */
export async function runLogoFinder(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const brand = await getBrandBySlug(slug);
  if (!brand) {
    redirect("/admin/brands/new");
    return;
  }
  const candidate = await findBrandLogo(brand.storeUrl);
  const params = new URLSearchParams({ step: "logo", slug });
  if (candidate) {
    params.set("candidate", candidate.url);
    params.set("source", candidate.source);
  } else {
    params.set("notfound", "1");
  }
  redirect(`/admin/brands/new?${params.toString()}`);
}

/** Step 2b: admin approved the found candidate. */
export async function approveLogo(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const candidate = String(formData.get("candidate") ?? "");
  if (slug && candidate) {
    await supabaseRest(`brands?slug=eq.${encodeURIComponent(slug)}`, { method: "PATCH", body: { logo_url: candidate }, prefer: "return=minimal" });
  }
  redirect(`/admin/brands/new?step=import&slug=${encodeURIComponent(slug)}`);
}

/** Step 2c: admin rejected the candidate (or none was found) and provided their own URL/upload. */
export async function saveManualLogo(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const logoUrlInput = String(formData.get("logo_url") ?? "").trim();
  const logoFile = formData.get("logo_file");

  let logoUrl = logoUrlInput || null;
  if (logoFile instanceof File && logoFile.size > 0) logoUrl = await uploadSiteAsset(logoFile, `brand-logos/${slug}`);
  if (slug && logoUrl) {
    await supabaseRest(`brands?slug=eq.${encodeURIComponent(slug)}`, { method: "PATCH", body: { logo_url: logoUrl }, prefer: "return=minimal" });
  }
  redirect(`/admin/brands/new?step=import&slug=${encodeURIComponent(slug)}`);
}

export async function skipLogo(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  redirect(`/admin/brands/new?step=import&slug=${encodeURIComponent(slug)}`);
}

/** Step 3: pull in the brand's full product catalog (images, sizes, prices — everything), then enable it for the daily refresh. */
export async function runImport(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const brand = await getBrandBySlug(slug);
  if (!brand) {
    redirect("/admin/brands/new");
    return;
  }
  const result = await syncSingleBrand(brand);
  await setBrandCatalogEnabled(slug, true);
  revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
  revalidatePath("/admin/brands");

  const params = new URLSearchParams({ step: "import", slug, imported: result.ok ? String(result.productCount) : "0" });
  if (!result.ok && result.error) params.set("importError", result.error);
  redirect(`/admin/brands/new?${params.toString()}`);
}

/** Called repeatedly from the client-side classify-runner until this brand has nothing left pending. */
export async function classifyBatchAction(brandSlug: string) {
  const result = await classifyPendingProducts(20, brandSlug);
  if (result.results.length) revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
  return result;
}
