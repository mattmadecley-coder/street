"use server";

import { revalidatePath } from "next/cache";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseRest, CATALOG_CACHE_TAG, CATALOG_REVALIDATE_SECONDS } from "@/lib/supabase-rest";
import { actorOf, requirePermission } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/audit";
import { safeAdminPath } from "@/lib/safe-redirect";
import { trashSupported } from "@/lib/trash";
import { BULK_LABELS, isBulkIntent, parseBulkIds, runBulk } from "@/lib/product-bulk";

type ProductSummary = { title: string; brands: { name: string } | null };

async function describeProduct(productId: string): Promise<{ label: string; title: string }> {
  try {
    const rows = await supabaseRest<ProductSummary[]>(`products?select=title,brands(name)&id=eq.${encodeURIComponent(productId)}&limit=1`, { noStore: true });
    const row = rows[0];
    return row ? { title: row.title, label: `${row.title}${row.brands ? ` (${row.brands.name})` : ""}` } : { title: "", label: productId };
  } catch {
    return { title: "", label: productId };
  }
}

function refresh() {
  revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
  revalidatePath("/admin/products");
}

function done(returnTo: string, flag: string): never {
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}saved=${flag}`);
}

export async function updateProductTaxonomy(formData: FormData) {
  const actor = await requirePermission("catalog.write");
  const productId = String(formData.get("product_id") ?? "").trim();
  if (!productId) throw new Error("Missing product id.");

  const orNull = (value: FormDataEntryValue | null) => {
    const text = String(value ?? "").trim();
    return text || null;
  };
  const tagsRaw = String(formData.get("street_tags") ?? "");
  const streetTags = tagsRaw.split(",").map((tag) => tag.trim()).filter(Boolean);
  const returnTo = safeAdminPath(formData.get("return_to"), "/admin/products");
  const fields = {
    street_group: orNull(formData.get("street_group")),
    street_category: orNull(formData.get("street_category")),
    street_type: orNull(formData.get("street_type")),
    street_detail: orNull(formData.get("street_detail")),
    street_activity: orNull(formData.get("street_activity")),
    street_tags: streetTags,
  };

  await supabaseRest(`products?id=eq.${encodeURIComponent(productId)}`, {
    method: "PATCH",
    body: {
      ...fields,
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

  const product = await describeProduct(productId);
  await recordAudit(actorOf(actor), { action: "product.taxonomy", targetType: "product", targetId: productId, summary: `Changed the category of ${product.label}`, details: fields });
  refresh();
  done(returnTo, productId);
}

/** Pulls a product off the site without deleting it — survives the next catalog re-sync since syncSingleBrand never touches is_hidden. */
export async function hideProduct(formData: FormData) {
  const actor = await requirePermission("catalog.write");
  const productId = String(formData.get("product_id") ?? "").trim();
  if (!productId) throw new Error("Missing product id.");
  const returnTo = safeAdminPath(formData.get("return_to"), "/admin/products");
  const hidden = formData.get("hidden") === "true";

  await supabaseRest(`products?id=eq.${encodeURIComponent(productId)}`, {
    method: "PATCH",
    body: { is_hidden: hidden },
    prefer: "return=minimal",
  });

  const product = await describeProduct(productId);
  await recordAudit(actorOf(actor), { action: hidden ? "product.hide" : "product.unhide", targetType: "product", targetId: productId, summary: `${hidden ? "Hid" : "Showed"} ${product.label}` });
  refresh();
  done(returnTo, productId);
}

/**
 * Delete. With the trash migration applied this is recoverable: the product is hidden from the
 * site and stamped deleted_at, and can be restored from the Trash view. Without it, it falls
 * back to the old permanent delete (FK-cascading its images and variants).
 */
export async function deleteProduct(formData: FormData) {
  const actor = await requirePermission("catalog.delete");
  const productId = String(formData.get("product_id") ?? "").trim();
  if (!productId) throw new Error("Missing product id.");
  const returnTo = safeAdminPath(formData.get("return_to"), "/admin/products");
  const product = await describeProduct(productId);

  if (await trashSupported()) {
    await supabaseRest(`products?id=eq.${encodeURIComponent(productId)}`, { method: "PATCH", body: { deleted_at: new Date().toISOString(), is_hidden: true }, prefer: "return=minimal" });
    await recordAudit(actorOf(actor), { action: "product.delete", targetType: "product", targetId: productId, summary: `Moved ${product.label} to the trash`, details: { mode: "trash", title: product.title } });
  } else {
    await supabaseRest(`products?id=eq.${encodeURIComponent(productId)}`, { method: "DELETE", prefer: "return=minimal" });
    await recordAudit(actorOf(actor), { action: "product.delete", targetType: "product", targetId: productId, summary: `Permanently deleted ${product.label}`, details: { mode: "permanent", title: product.title } });
  }
  refresh();
  done(returnTo, "deleted");
}

export async function restoreProduct(formData: FormData) {
  const actor = await requirePermission("catalog.delete");
  const productId = String(formData.get("product_id") ?? "").trim();
  if (!productId) throw new Error("Missing product id.");
  const returnTo = safeAdminPath(formData.get("return_to"), "/admin/products?status=trash");

  await supabaseRest(`products?id=eq.${encodeURIComponent(productId)}&deleted_at=not.is.null`, { method: "PATCH", body: { deleted_at: null, is_hidden: false }, prefer: "return=minimal" });
  const product = await describeProduct(productId);
  await recordAudit(actorOf(actor), { action: "product.restore", targetType: "product", targetId: productId, summary: `Restored ${product.label} from the trash` });
  refresh();
  done(returnTo, productId);
}

/** Permanently removes a product that is already in the trash. Owner only. */
export async function purgeProduct(formData: FormData) {
  const actor = await requirePermission("catalog.purge");
  const productId = String(formData.get("product_id") ?? "").trim();
  if (!productId) throw new Error("Missing product id.");
  const returnTo = safeAdminPath(formData.get("return_to"), "/admin/products?status=trash");
  const product = await describeProduct(productId);

  // The filter makes sure only trashed rows can be purged, never a live product.
  await supabaseRest(`products?id=eq.${encodeURIComponent(productId)}&deleted_at=not.is.null`, { method: "DELETE", prefer: "return=minimal" });
  await recordAudit(actorOf(actor), { action: "product.purge", targetType: "product", targetId: productId, summary: `Permanently deleted ${product.label} from the trash`, details: { title: product.title } });
  refresh();
  done(returnTo, "deleted");
}

/** Approve, hide, show or trash several products at once from the review queue (see lib/product-bulk.ts for the safety rules). */
export async function bulkProductAction(formData: FormData) {
  const intent = formData.get("intent");
  if (!isBulkIntent(intent)) throw new Error("Unknown bulk action.");
  const actor = await requirePermission(intent === "trash" ? "catalog.delete" : "catalog.write");
  const returnTo = safeAdminPath(formData.get("return_to"), "/admin/products");
  const join = returnTo.includes("?") ? "&" : "?";
  const fail = (message: string): never => redirect(`${returnTo}${join}bulkError=${encodeURIComponent(message)}`);

  const parsed = parseBulkIds(formData.getAll("ids"));
  if (!parsed.ok) return fail(parsed.error);

  let result: { changed: number; skipped: number };
  try {
    result = await runBulk(intent, parsed.ids, { trashOn: await trashSupported() });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The bulk action failed.");
  }

  await recordAudit(actorOf(actor), {
    action: BULK_LABELS[intent].audit,
    targetType: "product",
    summary: `${BULK_LABELS[intent].past} ${result.changed} product${result.changed === 1 ? "" : "s"}${result.skipped ? ` (${result.skipped} skipped)` : ""}`,
    details: { selected: parsed.ids.length, changed: result.changed, skipped: result.skipped, sampleIds: parsed.ids.slice(0, 20) },
  });
  refresh();
  redirect(`${returnTo}${join}bulk=${intent}:${result.changed}:${result.skipped}`);
}
