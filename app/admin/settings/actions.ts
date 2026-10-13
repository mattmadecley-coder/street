"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorOf, requirePermission } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/audit";
import { setAdminTimeZone } from "@/lib/admin-timezone";
import { resetAlertSummaryCache } from "@/lib/admin-alerts";
import { AdminStateUnavailableError, writeAdminState } from "@/lib/admin-state";
import { THRESHOLD_FIELDS, normalizeThresholds } from "@/lib/alert-thresholds";
import { isValidTimeZone } from "@/lib/date-range";

export async function saveTimeZone(formData: FormData) {
  const actor = await requirePermission("settings.write");
  const timeZone = String(formData.get("time_zone") ?? "").trim();
  if (!isValidTimeZone(timeZone)) redirect(`/admin/settings?error=${encodeURIComponent("Pick a valid time zone.")}`);
  await setAdminTimeZone(timeZone);
  await recordAudit(actorOf(actor), { action: "settings.timezone", targetType: "setting", targetId: "admin_time_zone", summary: `Set the reporting time zone to ${timeZone}`, details: { timeZone } });
  revalidatePath("/admin", "layout");
  redirect("/admin/settings?saved=1");
}

export async function saveThresholds(formData: FormData) {
  const actor = await requirePermission("settings.write");
  const raw: Record<string, string> = {};
  for (const field of THRESHOLD_FIELDS) raw[field.key] = String(formData.get(field.key) ?? "");
  const thresholds = normalizeThresholds(raw);
  try {
    await writeAdminState("alert_thresholds", thresholds);
  } catch (error) {
    if (error instanceof AdminStateUnavailableError) redirect(`/admin/settings?error=${encodeURIComponent(error.message)}#alert-thresholds`);
    throw error;
  }
  await recordAudit(actorOf(actor), { action: "settings.alert_thresholds", targetType: "setting", targetId: "alert_thresholds", summary: "Changed the alert thresholds", details: thresholds });
  resetAlertSummaryCache();
  revalidatePath("/admin", "layout");
  redirect("/admin/settings?saved=1#alert-thresholds");
}

export async function resetThresholds() {
  const actor = await requirePermission("settings.write");
  try {
    await writeAdminState("alert_thresholds", {});
  } catch (error) {
    if (error instanceof AdminStateUnavailableError) redirect(`/admin/settings?error=${encodeURIComponent(error.message)}#alert-thresholds`);
    throw error;
  }
  await recordAudit(actorOf(actor), { action: "settings.alert_thresholds", targetType: "setting", targetId: "alert_thresholds", summary: "Reset the alert thresholds to the defaults" });
  resetAlertSummaryCache();
  revalidatePath("/admin", "layout");
  redirect("/admin/settings?saved=1#alert-thresholds");
}
