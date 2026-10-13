"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorOf, requirePermission } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/audit";
import { AdminStateUnavailableError, writeAdminState } from "@/lib/admin-state";
import { addAnnotation, cleanAnnotation, loadAnnotations, removeAnnotation } from "@/lib/analytics-annotations";
import { safeAdminPath } from "@/lib/safe-redirect";

async function save(change: (items: Awaited<ReturnType<typeof loadAnnotations>>["items"]) => Awaited<ReturnType<typeof loadAnnotations>>["items"], returnTo: string) {
  try {
    const { items } = await loadAnnotations();
    await writeAdminState("analytics_annotations", { items: change(items) });
  } catch (error) {
    if (error instanceof AdminStateUnavailableError) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}annotationError=${encodeURIComponent(error.message)}`);
    throw error;
  }
  revalidatePath("/admin/analytics");
}

export async function addAnnotationAction(formData: FormData) {
  const actor = await requirePermission("analytics.write");
  const returnTo = safeAdminPath(formData.get("return_to"), "/admin/analytics");
  const annotation = cleanAnnotation({ date: formData.get("date"), text: formData.get("text") }, () => randomUUID());
  if (!annotation) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}annotationError=${encodeURIComponent("Enter a date and a short note.")}`);
  await save((items) => addAnnotation(items, annotation), returnTo);
  await recordAudit(actorOf(actor), { action: "analytics.annotation_add", targetType: "annotation", targetId: annotation.id, summary: `Added a chart note for ${annotation.date}`, details: { date: annotation.date, text: annotation.text } });
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}saved=1`);
}

export async function deleteAnnotationAction(formData: FormData) {
  const actor = await requirePermission("analytics.write");
  const returnTo = safeAdminPath(formData.get("return_to"), "/admin/analytics");
  const id = String(formData.get("id") ?? "");
  await save((items) => removeAnnotation(items, id), returnTo);
  await recordAudit(actorOf(actor), { action: "analytics.annotation_delete", targetType: "annotation", targetId: id, summary: "Deleted a chart note" });
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}saved=deleted`);
}
