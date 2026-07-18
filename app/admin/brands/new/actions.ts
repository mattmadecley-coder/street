"use server";

import { after } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createBrandDraft, findBrandByDomain, syncSingleBrand, setBrandCatalogEnabled, getBrandBySlug } from "@/lib/catalog-store";
import { recoverQueuedClassifications } from "@/lib/classification-recovery";
import { triggerClassificationDrain } from "@/lib/classification-trigger";
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
    redirect(`/admin/brands/new?error=${encodeURIComponent(`${existing.name} is already in Street's catalog (same domain: ${new URL(existing.storeUrl).hostname.replace(/^www\./, "")}).`)}`);
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

/** Import the catalog, then immediately drain that brand's classification queue. */
export async function runImport(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const brand = await getBrandBySlug(slug);
  if (!brand) {
    redirect("/admin/brands/new");
    return;
  }

  await setBrandCatalogEnabled(slug, true);

  after(async () => {
    const result = await syncSingleBrand(brand);
    if (!result.ok) return;
    revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });

    // Preferred path: hand classification to the dedicated drain endpoint.
    // It chains fresh invocations until this brand has no pending/error items.
    const triggered = await triggerClassificationDrain(slug);
    if (triggered) return;

    // Local-development fallback when no public site origin is configured.
    const deadline = Date.now() + 42_000;
    while (Date.now() < deadline) {
      const batch = await recoverQueuedClassifications(25, slug);
      if (!batch.results.length) break;
      revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
      if (batch.found < batch.limit) break;
    }
  });

  revalidatePath("/admin/brands");
  redirect(`/admin/brands?justAdded=${encodeURIComponent(slug)}`);
}

/** Called repeatedly from the admin runner until this brand has no pending/error products left. */
export async function classifyBatchAction(brandSlug: string) {
  const result = await recoverQueuedClassifications(25, brandSlug);
  if (result.results.length) revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
  return result;
}
