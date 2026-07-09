"use server";

import { revalidatePath } from "next/cache";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseRest, CATALOG_CACHE_TAG, CATALOG_REVALIDATE_SECONDS } from "@/lib/supabase-rest";

export async function updateProductTaxonomy(formData: FormData) {
  const productId = String(formData.get("product_id") ?? "").trim();
  if (!productId) throw new Error("Missing product id.");

  const orNull = (value: FormDataEntryValue | null) => {
    const text = String(value ?? "").trim();
    return text || null;
  };
  const tagsRaw = String(formData.get("street_tags") ?? "");
  const streetTags = tagsRaw.split(",").map((tag) => tag.trim()).filter(Boolean);
  const returnTo = String(formData.get("return_to") ?? "/admin/products");

  await supabaseRest(`products?id=eq.${encodeURIComponent(productId)}`, {
    method: "PATCH",
    body: {
      street_group: orNull(formData.get("street_group")),
      street_category: orNull(formData.get("street_category")),
      street_type: orNull(formData.get("street_type")),
      street_detail: orNull(formData.get("street_detail")),
      street_activity: orNull(formData.get("street_activity")),
      street_tags: streetTags,
      // A manual admin edit is authoritative: mark it classified so the
      // classification cron (which only touches classification_status='pending'
      // rows — see lib/catalog-store.ts) never overwrites it.
      classification_status: "classified",
      classification_confidence: "manual",
      classification_model: "manual-admin",
      classification_error: null,
      classified_at: new Date().toISOString(),
    },
    prefer: "return=minimal",
  });

  revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
  revalidatePath("/admin/products");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}saved=${productId}`);
}

/** Pulls a product off the site without deleting it — survives the next catalog re-sync since syncSingleBrand never touches is_hidden. */
export async function hideProduct(formData: FormData) {
  const productId = String(formData.get("product_id") ?? "").trim();
  if (!productId) throw new Error("Missing product id.");
  const returnTo = String(formData.get("return_to") ?? "/admin/products");
  const hidden = formData.get("hidden") === "true";

  await supabaseRest(`products?id=eq.${encodeURIComponent(productId)}`, {
    method: "PATCH",
    body: { is_hidden: hidden },
    prefer: "return=minimal",
  });

  revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
  revalidatePath("/admin/products");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}saved=${productId}`);
}

/** Permanently removes a product (and its images/variants, via FK cascade). Use hideProduct for a reversible pull-down instead unless it's genuinely junk data. */
export async function deleteProduct(formData: FormData) {
  const productId = String(formData.get("product_id") ?? "").trim();
  if (!productId) throw new Error("Missing product id.");
  const returnTo = String(formData.get("return_to") ?? "/admin/products");

  await supabaseRest(`products?id=eq.${encodeURIComponent(productId)}`, { method: "DELETE", prefer: "return=minimal" });

  revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
  revalidatePath("/admin/products");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}saved=deleted`);
}
