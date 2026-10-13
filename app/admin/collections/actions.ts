"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { slugify } from "@/lib/slug";
import { uploadSiteAsset } from "@/lib/supabase-storage";
import { CATALOG_CACHE_TAG, CATALOG_REVALIDATE_SECONDS } from "@/lib/supabase-rest";
import { actorOf, requirePermission } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/audit";
import { cleanCriteria, describeCriteria } from "@/lib/product-criteria";
import { cleanSmartRules, loadSmartRules, saveSmartRules, syncSmartCollection, validateSmartRules } from "@/lib/smart-collections";
import {
  createCollection,
  updateCollection,
  deleteCollection,
  addProductToCollection,
  removeProductFromCollection,
  moveProductInCollection,
  reorderCollectionProducts,
} from "@/lib/collections-store";

function bump() {
  revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
  revalidatePath("/");
}

export async function createCollectionAction(formData: FormData) {
  const actor = await requirePermission("catalog.write");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Title is required.");
  const subtitle = String(formData.get("subtitle") ?? "").trim();

  const baseSlug = slugify(title) || `collection-${Date.now()}`;
  await createCollection({ slug: baseSlug, title, subtitle });

  await recordAudit(actorOf(actor), { action: "collection.create", summary: `Created collection "${title}"`, targetType: "collection", targetId: baseSlug });
  revalidatePath("/admin/collections");
  redirect(`/admin/collections/${baseSlug}`);
}

export async function updateCollectionAction(formData: FormData) {
  const actor = await requirePermission("catalog.write");
  const id = String(formData.get("id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!id) throw new Error("Missing collection id.");

  const title = String(formData.get("title") ?? "").trim();
  const subtitle = String(formData.get("subtitle") ?? "").trim();
  const isActive = formData.get("is_active") === "on";
  const coverUrlInput = String(formData.get("cover_image_url") ?? "").trim();
  const coverFile = formData.get("cover_file");

  let coverImageUrl: string | null | undefined = coverUrlInput || undefined;
  if (coverFile instanceof File && coverFile.size > 0) {
    coverImageUrl = await uploadSiteAsset(coverFile, `collection-covers/${slug}`);
  }

  await updateCollection(id, { title, subtitle: subtitle || null, isActive, ...(coverImageUrl !== undefined ? { coverImageUrl } : {}) });

  await recordAudit(actorOf(actor), { action: "collection.update", summary: `Updated collection "${title || slug}"`, targetType: "collection", targetId: id, details: { title, subtitle, isActive } });
  bump();
  revalidatePath("/admin/collections");
  redirect(`/admin/collections/${slug}?saved=1`);
}

export async function deleteCollectionAction(formData: FormData) {
  const actor = await requirePermission("catalog.delete");
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing collection id.");
  await deleteCollection(id);
  await recordAudit(actorOf(actor), { action: "collection.delete", summary: `Deleted a collection`, targetType: "collection", targetId: id });
  bump();
  revalidatePath("/admin/collections");
  redirect("/admin/collections?deleted=1");
}

export async function addProductAction(formData: FormData) {
  const actor = await requirePermission("catalog.write");
  const collectionId = String(formData.get("collection_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  if (!collectionId || !productId) throw new Error("Missing collection or product id.");

  await addProductToCollection(collectionId, productId);
  await recordAudit(actorOf(actor), { action: "collection.add_product", summary: `Added a product to collection ${slug}`, targetType: "collection", targetId: collectionId, details: { productId } });
  bump();
  redirect(`/admin/collections/${slug}`);
}

export async function removeProductAction(formData: FormData) {
  const actor = await requirePermission("catalog.write");
  const collectionId = String(formData.get("collection_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  if (!collectionId || !productId) throw new Error("Missing collection or product id.");

  await removeProductFromCollection(collectionId, productId);
  await recordAudit(actorOf(actor), { action: "collection.remove_product", summary: `Removed a product from collection ${slug}`, targetType: "collection", targetId: collectionId, details: { productId } });
  bump();
  redirect(`/admin/collections/${slug}`);
}

/**
 * Called directly from a client component (not a <form action>), so the
 * client can update its own local order immediately and let this run in the
 * background — one request for the whole reorder instead of a full-page
 * reload per up/down nudge. No redirect: the caller already has the new
 * order and just needs it persisted.
 */
export async function reorderProductsAction(collectionId: string, orderedProductIds: string[]): Promise<void> {
  const actor = await requirePermission("catalog.write");
  if (!collectionId || !orderedProductIds.length) return;
  await reorderCollectionProducts(collectionId, orderedProductIds);
  await recordAudit(actorOf(actor), { action: "collection.reorder", summary: `Reordered a collection`, targetType: "collection", targetId: collectionId, details: { count: orderedProductIds.length } });
  bump();
}

export async function moveProductAction(formData: FormData) {
  const actor = await requirePermission("catalog.write");
  const collectionId = String(formData.get("collection_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  const direction = String(formData.get("direction") ?? "up") === "down" ? "down" : "up";
  if (!collectionId || !productId) throw new Error("Missing collection or product id.");

  await moveProductInCollection(collectionId, productId, direction);
  await recordAudit(actorOf(actor), { action: "collection.move_product", summary: `Moved a product ${direction} in collection ${slug}`, targetType: "collection", targetId: collectionId, details: { productId, direction } });
  bump();
  redirect(`/admin/collections/${slug}`);
}

function criteriaFromForm(formData: FormData) {
  const brands = formData.getAll("brands").map(String);
  return cleanCriteria({
    q: formData.get("q"),
    brands,
    group: formData.get("group"),
    category: formData.get("category"),
    type: formData.get("type"),
    tags: String(formData.get("tags") ?? ""),
    minPrice: formData.get("min_price"),
    maxPrice: formData.get("max_price"),
    stock: formData.get("stock"),
    addedWithinDays: formData.get("added_within_days"),
    onSale: formData.get("on_sale"),
  });
}

/** Saves a collection's rules and, when they are switched on, updates its products right away. */
export async function saveSmartRulesAction(formData: FormData) {
  const actor = await requirePermission("catalog.write");
  const id = String(formData.get("id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!id || !slug) throw new Error("Missing collection.");

  const { rules: stored, available } = await loadSmartRules();
  if (!available) redirect(`/admin/collections/${slug}?smart=unavailable`);

  const rules = cleanSmartRules({
    enabled: formData.get("enabled") === "on",
    criteria: criteriaFromForm(formData),
    order: formData.get("order"),
    limit: formData.get("limit"),
    lastSyncAt: stored[id]?.lastSyncAt,
    lastCount: stored[id]?.lastCount,
  });
  const problem = validateSmartRules(rules);
  if (problem) redirect(`/admin/collections/${slug}?smart=${encodeURIComponent(problem)}`);

  let outcome = "saved";
  let next = rules;
  if (rules.enabled) {
    const result = await syncSmartCollection(id, rules);
    next = { ...rules, lastSyncAt: new Date().toISOString(), lastCount: result.total };
    outcome = `synced:${result.added}:${result.removed}:${result.total}`;
  }
  await saveSmartRules({ ...stored, [id]: next });
  await recordAudit(actorOf(actor), { action: "collection.smart_rules", summary: `${rules.enabled ? "Updated" : "Saved"} automatic rules for collection ${slug}`, targetType: "collection", targetId: id, details: { enabled: rules.enabled, rules: describeCriteria(rules.criteria), outcome } });
  bump();
  revalidatePath("/admin/collections");
  redirect(`/admin/collections/${slug}?smart=${encodeURIComponent(outcome)}`);
}

/** Runs the saved rules again now, without changing them. */
export async function syncSmartNowAction(formData: FormData) {
  const actor = await requirePermission("catalog.write");
  const id = String(formData.get("id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const { rules: stored, available } = await loadSmartRules();
  const rules = stored[id];
  if (!available || !rules?.enabled) redirect(`/admin/collections/${slug}`);
  const result = await syncSmartCollection(id, rules);
  await saveSmartRules({ ...stored, [id]: { ...rules, lastSyncAt: new Date().toISOString(), lastCount: result.total } });
  await recordAudit(actorOf(actor), { action: "collection.smart_sync", summary: `Updated collection ${slug} from its rules`, targetType: "collection", targetId: id, details: { ...result } });
  bump();
  revalidatePath("/admin/collections");
  redirect(`/admin/collections/${slug}?smart=${encodeURIComponent(`synced:${result.added}:${result.removed}:${result.total}`)}`);
}
