"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { slugify } from "@/lib/slug";
import { uploadSiteAsset } from "@/lib/supabase-storage";
import { CATALOG_CACHE_TAG, CATALOG_REVALIDATE_SECONDS } from "@/lib/supabase-rest";
import { actorOf, requirePermission } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/audit";
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
