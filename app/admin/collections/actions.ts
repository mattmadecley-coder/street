"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { slugify } from "@/lib/slug";
import { uploadSiteAsset } from "@/lib/supabase-storage";
import { CATALOG_CACHE_TAG, CATALOG_REVALIDATE_SECONDS } from "@/lib/supabase-rest";
import {
  createCollection,
  updateCollection,
  deleteCollection,
  addProductToCollection,
  removeProductFromCollection,
  moveProductInCollection,
} from "@/lib/collections-store";

function bump() {
  revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
  revalidatePath("/");
}

export async function createCollectionAction(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Title is required.");
  const subtitle = String(formData.get("subtitle") ?? "").trim();

  const baseSlug = slugify(title) || `collection-${Date.now()}`;
  await createCollection({ slug: baseSlug, title, subtitle });

  revalidatePath("/admin/collections");
  redirect(`/admin/collections/${baseSlug}`);
}

export async function updateCollectionAction(formData: FormData) {
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

  bump();
  revalidatePath("/admin/collections");
  redirect(`/admin/collections/${slug}?saved=1`);
}

export async function deleteCollectionAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing collection id.");
  await deleteCollection(id);
  bump();
  revalidatePath("/admin/collections");
  redirect("/admin/collections?deleted=1");
}

export async function addProductAction(formData: FormData) {
  const collectionId = String(formData.get("collection_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  if (!collectionId || !productId) throw new Error("Missing collection or product id.");

  await addProductToCollection(collectionId, productId);
  bump();
  redirect(`/admin/collections/${slug}`);
}

export async function removeProductAction(formData: FormData) {
  const collectionId = String(formData.get("collection_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  if (!collectionId || !productId) throw new Error("Missing collection or product id.");

  await removeProductFromCollection(collectionId, productId);
  bump();
  redirect(`/admin/collections/${slug}`);
}

export async function moveProductAction(formData: FormData) {
  const collectionId = String(formData.get("collection_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  const direction = String(formData.get("direction") ?? "up") === "down" ? "down" : "up";
  if (!collectionId || !productId) throw new Error("Missing collection or product id.");

  await moveProductInCollection(collectionId, productId, direction);
  bump();
  redirect(`/admin/collections/${slug}`);
}
