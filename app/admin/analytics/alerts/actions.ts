"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorOf, requirePermission } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/audit";
import { ALERT_RULE_KEYS } from "@/lib/admin-alert-rules";
import { resetAlertSummaryCache } from "@/lib/admin-alerts";
import { AdminStateUnavailableError, readAdminState, writeAdminState } from "@/lib/admin-state";
import { acknowledge, restore, snooze, type AlertStates } from "@/lib/alert-states";

const SEVERITIES = ["critical", "warning"] as const;

function parseRule(formData: FormData) {
  const key = String(formData.get("key") ?? "");
  const severity = String(formData.get("severity") ?? "");
  if (!(ALERT_RULE_KEYS as readonly string[]).includes(key)) throw new Error("Unknown alert.");
  if (!(SEVERITIES as readonly string[]).includes(severity)) throw new Error("Unknown severity.");
  return { key, severity: severity as (typeof SEVERITIES)[number] };
}

async function update(change: (states: AlertStates) => AlertStates) {
  try {
    const { value } = await readAdminState<AlertStates>("alert_states", {});
    await writeAdminState("alert_states", change(value));
  } catch (error) {
    if (error instanceof AdminStateUnavailableError) redirect(`/admin/analytics/alerts?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
  resetAlertSummaryCache();
  revalidatePath("/admin", "layout");
}

export async function acknowledgeAlert(formData: FormData) {
  const actor = await requirePermission("analytics.write");
  const rule = parseRule(formData);
  await update((states) => acknowledge(states, rule, Date.now()));
  await recordAudit(actorOf(actor), { action: "analytics.alert_acknowledge", targetType: "alert", targetId: rule.key, summary: `Acknowledged the alert "${rule.key}"`, details: { severity: rule.severity } });
  redirect("/admin/analytics/alerts?saved=1");
}

export async function snoozeAlert(formData: FormData) {
  const actor = await requirePermission("analytics.write");
  const rule = parseRule(formData);
  const days = Number(formData.get("days"));
  if (!Number.isFinite(days)) throw new Error("Pick how long to snooze.");
  await update((states) => snooze(states, rule, days, Date.now()));
  await recordAudit(actorOf(actor), { action: "analytics.alert_snooze", targetType: "alert", targetId: rule.key, summary: `Snoozed the alert "${rule.key}" for ${days} day${days === 1 ? "" : "s"}`, details: { severity: rule.severity, days } });
  redirect("/admin/analytics/alerts?saved=1");
}

export async function restoreAlert(formData: FormData) {
  const actor = await requirePermission("analytics.write");
  const key = String(formData.get("key") ?? "");
  if (!(ALERT_RULE_KEYS as readonly string[]).includes(key)) throw new Error("Unknown alert.");
  await update((states) => restore(states, key));
  await recordAudit(actorOf(actor), { action: "analytics.alert_restore", targetType: "alert", targetId: key, summary: `Restored the alert "${key}"` });
  redirect("/admin/analytics/alerts?saved=1");
}
