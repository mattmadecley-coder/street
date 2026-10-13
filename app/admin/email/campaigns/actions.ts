"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorOf, requirePermission } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/audit";
import { createCampaign, deleteCampaign, getCampaign, saveDraft } from "@/lib/email-campaigns";
import { cancelCampaign, prepareCampaign, runEmailQueue, sendTestEmail } from "@/lib/email-send";
import { getTemplate } from "@/lib/email-templates";
import { saveEmailSettings } from "@/lib/email-settings";

const go = (id: string, params: Record<string, string>): never => redirect(`/admin/email/campaigns/${id}?${new URLSearchParams(params).toString()}`);

function draftFields(formData: FormData) {
  return {
    name: formData.get("name"),
    templateId: formData.get("template_id"),
    segmentId: formData.get("segment_id"),
    subject: formData.get("subject"),
    preheader: formData.get("preheader"),
    scheduledAt: formData.get("scheduled_at"),
  };
}

export async function createCampaignAction() {
  const actor = await requirePermission("email.write");
  const id = await createCampaign(actor.email);
  await recordAudit(actorOf(actor), { action: "email.campaign_create", summary: "Created an email campaign draft", targetType: "email_campaign", targetId: id });
  redirect(`/admin/email/campaigns/${id}`);
}

async function saveFromForm(id: string, formData: FormData) {
  const campaign = await getCampaign(id);
  if (!campaign) redirect("/admin/email/campaigns?error=" + encodeURIComponent("That campaign no longer exists."));
  if (campaign!.status !== "draft" && campaign!.status !== "scheduled") go(id, { error: "This campaign can no longer be edited." });
  try {
    await saveDraft(id, draftFields(formData));
  } catch (error) {
    go(id, { error: error instanceof Error ? error.message : "Could not save." });
  }
}

export async function saveCampaignAction(formData: FormData) {
  const actor = await requirePermission("email.write");
  const id = String(formData.get("id") ?? "");
  await saveFromForm(id, formData);
  await recordAudit(actorOf(actor), { action: "email.campaign_save", summary: "Saved an email campaign draft", targetType: "email_campaign", targetId: id });
  revalidatePath("/admin/email/campaigns");
  go(id, { saved: "1" });
}

export async function sendTestAction(formData: FormData) {
  const actor = await requirePermission("email.write");
  const id = String(formData.get("id") ?? "");
  await saveFromForm(id, formData);
  const campaign = (await getCampaign(id))!;
  if (!campaign.template_id) go(id, { error: "Choose a template to send a test." });
  const template = await getTemplate(campaign.template_id!);
  if (!template) go(id, { error: "That template no longer exists." });
  const to = actor.kind === "user" ? actor.email : (process.env.BRAND_REPORTS_TEST_TO ?? "").trim();
  if (!to) go(id, { error: "No address to send the test to." });
  const result = await sendTestEmail({ content: template!, subject: campaign.subject || template!.subject, preheader: campaign.preheader || template!.preheader, to, campaignId: id });
  if (!result.ok) go(id, { error: `Test failed: ${result.error}` });
  await recordAudit(actorOf(actor), { action: "email.campaign_test", summary: "Sent a test email", targetType: "email_campaign", targetId: id, details: { to } });
  go(id, { tested: to });
}

export async function scheduleCampaignAction(formData: FormData) {
  const actor = await requirePermission("email.send");
  const id = String(formData.get("id") ?? "");
  await saveFromForm(id, formData);
  const campaign = (await getCampaign(id))!;
  const prepared = await prepareCampaign(campaign, "schedule");
  if (!prepared.ok) go(id, { error: prepared.error });
  await recordAudit(actorOf(actor), { action: "email.campaign_schedule", summary: `Scheduled the campaign "${campaign.name}"`, targetType: "email_campaign", targetId: id, details: { at: campaign.scheduled_at, recipients: prepared.ok ? prepared.recipients : 0 } });
  revalidatePath("/admin/email/campaigns");
  go(id, { scheduled: "1" });
}

export async function sendNowAction(formData: FormData) {
  const actor = await requirePermission("email.send");
  const id = String(formData.get("id") ?? "");
  await saveFromForm(id, formData);
  const campaign = (await getCampaign(id))!;
  const prepared = await prepareCampaign(campaign, "send_now");
  if (!prepared.ok) go(id, { error: prepared.error });
  await recordAudit(actorOf(actor), { action: "email.campaign_send", summary: `Started sending the campaign "${campaign.name}"`, targetType: "email_campaign", targetId: id, details: { recipients: prepared.ok ? prepared.recipients : 0 } });
  // Send in the background so the page returns immediately; the 10-minute job picks up anything left.
  after(() => runEmailQueue(Date.now(), 45_000).catch((error) => console.error("email send failed", error)));
  revalidatePath("/admin/email/campaigns");
  go(id, { started: "1" });
}

export async function cancelCampaignAction(formData: FormData) {
  const actor = await requirePermission("email.send");
  const id = String(formData.get("id") ?? "");
  const campaign = await getCampaign(id);
  if (campaign) {
    await cancelCampaign(id);
    await recordAudit(actorOf(actor), { action: "email.campaign_cancel", summary: `Canceled the campaign "${campaign.name}"`, targetType: "email_campaign", targetId: id });
  }
  revalidatePath("/admin/email/campaigns");
  go(id, { canceled: "1" });
}

export async function deleteCampaignAction(formData: FormData) {
  const actor = await requirePermission("email.write");
  const id = String(formData.get("id") ?? "");
  await deleteCampaign(id);
  await recordAudit(actorOf(actor), { action: "email.campaign_delete", summary: "Deleted an email campaign", targetType: "email_campaign", targetId: id });
  revalidatePath("/admin/email/campaigns");
  redirect("/admin/email/campaigns?deleted=1");
}

export async function saveEmailSettingsAction(formData: FormData) {
  const actor = await requirePermission("email.send");
  try {
    await saveEmailSettings({ fromName: formData.get("from_name"), fromLocal: formData.get("from_local"), replyTo: formData.get("reply_to"), dailyCap: formData.get("daily_cap") });
  } catch (error) {
    redirect(`/admin/email/settings?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not save.")}`);
  }
  await recordAudit(actorOf(actor), { action: "email.settings_save", summary: "Changed email sending settings", targetType: "email_settings" });
  redirect("/admin/email/settings?saved=1");
}
