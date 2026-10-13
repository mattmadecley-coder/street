"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorOf, requirePermission } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/audit";
import { cleanDefinition, deleteSegment, describeDefinition, getSegment, loadContactsForSegments, saveSegment, summarizeSegment, type SegmentSummary } from "@/lib/email-segments";

/** Live count for the builder. Returns plain data (never throws) so the form can show the problem. */
export async function previewSegmentAction(definitionJson: string): Promise<{ ok: true; summary: SegmentSummary } | { ok: false; error: string }> {
  await requirePermission("view");
  try {
    const { definition } = cleanDefinition(JSON.parse(definitionJson));
    const { contacts } = await loadContactsForSegments();
    return { ok: true, summary: summarizeSegment(definition, contacts) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not count this segment." };
  }
}

export async function saveSegmentAction(formData: FormData) {
  const actor = await requirePermission("email.write");
  const id = String(formData.get("id") ?? "");
  let definitionInput: unknown = {};
  try { definitionInput = JSON.parse(String(formData.get("definition") ?? "{}")); } catch { /* treated as empty */ }
  const { definition, dropped } = cleanDefinition(definitionInput);
  if (id && !(await getSegment(id))) redirect("/admin/email/segments?error=" + encodeURIComponent("That segment no longer exists."));

  let savedId: string;
  try {
    savedId = await saveSegment({ id: id || undefined, name: String(formData.get("name") ?? ""), description: String(formData.get("description") ?? ""), definition, actor: actor.email });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the segment.";
    redirect(`${id ? `/admin/email/segments/${id}` : "/admin/email/segments/new"}?error=${encodeURIComponent(message)}`);
  }
  await recordAudit(actorOf(actor), { action: id ? "email.segment_update" : "email.segment_create", summary: `${id ? "Updated" : "Created"} the segment "${String(formData.get("name") ?? "").slice(0, 80)}"`, targetType: "email_segment", targetId: savedId, details: { rules: describeDefinition(definition), dropped } });
  revalidatePath("/admin/email/segments");
  redirect(`/admin/email/segments/${savedId}?saved=1`);
}

export async function deleteSegmentAction(formData: FormData) {
  const actor = await requirePermission("email.write");
  const id = String(formData.get("id") ?? "");
  const segment = await getSegment(id);
  if (segment) {
    await deleteSegment(id);
    await recordAudit(actorOf(actor), { action: "email.segment_delete", summary: `Deleted the segment "${segment.name}"`, targetType: "email_segment", targetId: id });
  }
  revalidatePath("/admin/email/segments");
  redirect("/admin/email/segments?deleted=1");
}
