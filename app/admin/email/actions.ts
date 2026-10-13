"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseRest } from "@/lib/supabase-rest";
import { mergePopupConfig } from "@/lib/email-popup-config";
import { logContactEvent } from "@/lib/email-marketing";
import { actorOf, requirePermission } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/audit";

export async function publishPopupAction(formData: FormData) {
  const actor = await requirePermission("reports.manage");
  let config;
  try {
    config = mergePopupConfig(JSON.parse(String(formData.get("config") ?? "{}")));
  } catch {
    redirect("/admin/email/popup?error=Couldn%27t%20read%20the%20popup%20settings");
  }
  await supabaseRest("email_popup_settings?on_conflict=id", {
    method: "POST",
    body: { id: 1, config, updated_at: new Date().toISOString() },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  await recordAudit(actorOf(actor), { action: "email.popup_publish", summary: config.enabled ? "Published the signup popup (live)" : "Published the signup popup (off)", targetType: "email_popup" });
  revalidatePath("/admin/email/popup");
  redirect(`/admin/email/popup?published=${config.enabled ? "live" : "off"}`);
}

export async function setContactStatusAction(formData: FormData) {
  const actor = await requirePermission("reports.manage");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["subscribed", "unsubscribed"].includes(status)) return;
  const now = new Date().toISOString();
  await supabaseRest(`email_contacts?id=eq.${id}`, {
    method: "PATCH",
    body: { status, updated_at: now, unsubscribed_at: status === "unsubscribed" ? now : null },
    prefer: "return=minimal",
  });
  await logContactEvent(id, status === "unsubscribed" ? "unsubscribed_by_admin" : "resubscribed_by_admin");
  await recordAudit(actorOf(actor), { action: "email.contact_status", summary: `Set a contact to ${status}`, targetType: "email_contact", targetId: id });
  revalidatePath(`/admin/email/contacts/${id}`);
}
