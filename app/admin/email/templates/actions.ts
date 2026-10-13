"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorOf, requirePermission } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/audit";
import { cleanTemplate, TEMPLATE_PRESETS, type EmailBlock, type ProductCard } from "@/lib/email-blocks";
import { createTemplate, duplicateTemplate, getTemplate, setTemplateArchived, updateTemplate } from "@/lib/email-templates";
import { findProductCards } from "@/lib/email-products";
import { uploadSiteAsset } from "@/lib/supabase-storage";

export async function createTemplateAction(formData: FormData) {
  const actor = await requirePermission("email.write");
  const preset = TEMPLATE_PRESETS.find((entry) => entry.key === String(formData.get("preset") ?? "")) ?? TEMPLATE_PRESETS[TEMPLATE_PRESETS.length - 1];
  let id: string;
  try {
    id = await createTemplate(preset.build(), actor.email);
  } catch (error) {
    redirect(`/admin/email/templates?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not create the template.")}`);
  }
  await recordAudit(actorOf(actor), { action: "email.template_create", summary: `Created an email template from "${preset.name}"`, targetType: "email_template", targetId: id });
  revalidatePath("/admin/email/templates");
  redirect(`/admin/email/templates/${id}`);
}

export type SaveResult = { ok: true; savedAt: string; dropped: number } | { ok: false; error: string };

/** Called directly by the editor (not a form), so it returns a result instead of redirecting. */
export async function saveTemplateAction(id: string, payload: unknown): Promise<SaveResult> {
  const actor = await requirePermission("email.write");
  try {
    if (!(await getTemplate(id))) return { ok: false, error: "This template no longer exists." };
    const { template, dropped } = await updateTemplate(id, payload);
    await recordAudit(actorOf(actor), { action: "email.template_update", summary: `Saved the email template "${template.name}"`, targetType: "email_template", targetId: id, details: { blocks: template.blocks.length, dropped } });
    revalidatePath("/admin/email/templates");
    return { ok: true, savedAt: new Date().toISOString(), dropped };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save." };
  }
}

/** Live product cards for the editor preview. Only product blocks are looked at. */
export async function previewProductsAction(blocks: unknown): Promise<Record<string, ProductCard[]>> {
  await requirePermission("view");
  const { template } = cleanTemplate({ blocks });
  const out: Record<string, ProductCard[]> = {};
  for (const block of template.blocks as EmailBlock[]) {
    if (block.type !== "products") continue;
    out[block.id] = await findProductCards(block.criteria, block.count, block.order).catch(() => []);
  }
  return out;
}

export async function uploadEmailImageAction(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requirePermission("email.write");
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose an image first." };
  if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type)) return { ok: false, error: "Use a PNG, JPG, GIF or WebP image." };
  try {
    return { ok: true, url: await uploadSiteAsset(file, "email-images") };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Upload failed." };
  }
}

export async function duplicateTemplateAction(formData: FormData) {
  const actor = await requirePermission("email.write");
  const id = await duplicateTemplate(String(formData.get("id") ?? ""), actor.email);
  if (!id) redirect("/admin/email/templates?error=" + encodeURIComponent("That template was not found."));
  await recordAudit(actorOf(actor), { action: "email.template_duplicate", summary: "Duplicated an email template", targetType: "email_template", targetId: id });
  revalidatePath("/admin/email/templates");
  redirect(`/admin/email/templates/${id}`);
}

export async function archiveTemplateAction(formData: FormData) {
  const actor = await requirePermission("email.write");
  const id = String(formData.get("id") ?? "");
  const archived = String(formData.get("archived") ?? "1") === "1";
  await setTemplateArchived(id, archived);
  await recordAudit(actorOf(actor), { action: archived ? "email.template_archive" : "email.template_restore", summary: `${archived ? "Archived" : "Restored"} an email template`, targetType: "email_template", targetId: id });
  revalidatePath("/admin/email/templates");
  redirect("/admin/email/templates");
}
