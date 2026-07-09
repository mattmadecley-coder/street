"use server";

import { after } from "next/server";
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

/**
 * Step 3: pull in the brand's full product catalog (images, sizes, prices —
 * everything), then classify whatever came in. This used to block the admin
 * on this page until both steps finished, which could take a while for a
 * big catalog. Now the wizard hands off to a background task (Next's
 * after(), same pattern as analytics logging) and sends the admin straight
 * to /admin/brands, where the brand shows up pinned under "Recently added"
 * with a live "Importing..." / "Classifying (x of y)..." status until it's
 * done — see the polling in that page.
 */
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

    // Classify in a loop, budgeted so this never runs past the function's
    // own timeout (vercel.json sets maxDuration=60 on this route). Anything
    // left pending when the budget runs out just sits as "pending" — the
    // admin can finish it with the manual "Classify now" button on
    // /admin/brands, or it gets picked up by a future classify pass.
    const deadline = Date.now() + 40_000;
    while (Date.now() < deadline) {
      const batch = await classifyPendingProducts(20, slug);
      if (!batch.results.length) break;
      revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
    }
  });

  revalidatePath("/admin/brands");
  redirect(`/admin/brands?justAdded=${encodeURIComponent(slug)}`);
}

/** Called repeatedly from the client-side classify-runner until this brand has nothing left pending. */
export async function classifyBatchAction(brandSlug: string) {
  const result = await classifyPendingProducts(20, brandSlug);
  if (result.results.length) revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
  return result;
}
