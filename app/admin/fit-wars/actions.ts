"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorOf, requirePermission } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/audit";
import { campaignIsReady, cleanCampaignCode, cleanFitWarsText, cleanPublicUrl, isCampaignCode, type FitWarsPermissionStatus, type FitWarsSourceType, type FitWarsStatus } from "@/lib/fit-wars";
import { supabaseRest } from "@/lib/supabase-rest";
import { uploadSiteAsset } from "@/lib/supabase-storage";

function back(campaignId?: string, error?: string, saved?: string): never {
  const path = campaignId ? `/admin/fit-wars/${encodeURIComponent(campaignId)}` : "/admin/fit-wars";
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (saved) params.set("saved", saved);
  redirect(`${path}${params.toString() ? `?${params.toString()}` : ""}`);
}

function requiredId(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(`Missing ${name}.`);
  return value;
}

export async function createCampaign(formData: FormData) {
  const actor = await requirePermission("analytics.write");
  const schoolName = cleanFitWarsText(formData.get("school_name"), 120);
  const code = cleanCampaignCode(formData.get("code"));
  if (!schoolName || !isCampaignCode(code)) return back(undefined, "Enter a school name and a short URL code using letters, numbers, or hyphens.");
  try {
    const created = await supabaseRest<Array<{ id: string }>>("fit_wars_campaigns", { method: "POST", body: { school_name: schoolName, code, label: cleanFitWarsText(formData.get("label"), 120) || `${schoolName.toUpperCase()} FIT WARS`, headline: cleanFitWarsText(formData.get("headline"), 180) || "WHOSE FIT IS BETTER?", audience_type: formData.get("audience_type") === "adult_opt_in" ? "adult_opt_in" : "high_school", created_by: actor.id }, });
    const id = created[0]?.id;
    if (!id) return back(undefined, "The campaign could not be created.");
    await recordAudit(actorOf(actor), { action: "fit_wars.campaign_create", targetType: "fit_wars_campaign", targetId: id, summary: `Created Fit Wars campaign ${schoolName}`, details: { code, schoolName } });
    revalidatePath("/admin/fit-wars");
    redirect(`/admin/fit-wars/${id}`);
  } catch (error) {
    return back(undefined, error instanceof Error && /duplicate|unique/i.test(error.message) ? "That URL code is already in use." : "The campaign could not be created.");
  }
}

export async function updateCampaign(formData: FormData) {
  const actor = await requirePermission("analytics.write");
  const id = requiredId(formData, "campaign_id");
  const body = {
    school_name: cleanFitWarsText(formData.get("school_name"), 120),
    code: cleanCampaignCode(formData.get("code")),
    label: cleanFitWarsText(formData.get("label"), 120),
    headline: cleanFitWarsText(formData.get("headline"), 180) || "WHOSE FIT IS BETTER?",
    audience_type: formData.get("audience_type") === "adult_opt_in" ? "adult_opt_in" : "high_school",
    results_headline: cleanFitWarsText(formData.get("results_headline"), 180) || "WANT TO SEE WHO HAD THE WORST FIT?",
    results_copy: cleanFitWarsText(formData.get("results_copy"), 300) || "Enter your email to get the final Fit Wars leaderboard.",
    results_note: cleanFitWarsText(formData.get("results_note"), 300) || "Get the current Fit Wars leaderboard sent to your inbox.",
    marketing_label: cleanFitWarsText(formData.get("marketing_label"), 180) || "Allow Street to send you emails",
    updated_at: new Date().toISOString(),
  };
  if (!body.school_name || !isCampaignCode(body.code)) return back(id, "Enter a school name and a valid short URL code.");
  try {
    await supabaseRest(`fit_wars_campaigns?id=eq.${id}`, { method: "PATCH", body, prefer: "return=minimal" });
    await recordAudit(actorOf(actor), { action: "fit_wars.campaign_update", targetType: "fit_wars_campaign", targetId: id, summary: `Updated Fit Wars campaign ${body.school_name}`, details: body });
    revalidatePath(`/admin/fit-wars/${id}`);
    revalidatePath(`/f/${body.code}`);
    revalidatePath("/admin/fit-wars");
    back(id, undefined, "Campaign saved.");
  } catch (error) {
    back(id, error instanceof Error && /duplicate|unique/i.test(error.message) ? "That URL code is already in use." : "The campaign could not be saved.");
  }
}

export async function setCampaignStatus(formData: FormData) {
  const actor = await requirePermission("analytics.write");
  const id = requiredId(formData, "campaign_id");
  const status = String(formData.get("status") ?? "") as FitWarsStatus;
  if (!["draft", "active", "paused", "archived"].includes(status)) return back(id, "That campaign status is not valid.");
  if (status === "active" && !(await campaignIsReady(id))) return back(id, "Add at least one active matchup with two approved outfit images before publishing.");
  const now = new Date().toISOString();
  await supabaseRest(`fit_wars_campaigns?id=eq.${id}`, { method: "PATCH", body: { status, updated_at: now, ...(status === "active" ? { activated_at: now, archived_at: null } : {}), ...(status === "archived" ? { archived_at: now } : {}) }, prefer: "return=minimal" });
  await recordAudit(actorOf(actor), { action: `fit_wars.campaign_${status}`, targetType: "fit_wars_campaign", targetId: id, summary: `${status === "active" ? "Published" : status === "paused" ? "Paused" : status === "archived" ? "Archived" : "Saved draft"} a Fit Wars campaign` });
  revalidatePath(`/admin/fit-wars/${id}`);
  revalidatePath("/admin/fit-wars");
  back(id, undefined, `Campaign ${status === "active" ? "published" : status}.`);
}

export async function saveOutfit(formData: FormData) {
  const actor = await requirePermission("analytics.write");
  const campaignId = requiredId(formData, "campaign_id");
  const id = String(formData.get("outfit_id") ?? "").trim();
  const displayName = cleanFitWarsText(formData.get("display_name"), 100);
  const sourceType = (String(formData.get("source_type") ?? "url") as FitWarsSourceType);
  const permissionStatus = (String(formData.get("permission_status") ?? "pending") as FitWarsPermissionStatus);
  const imageFile = formData.get("image_file");
  const imageUrlInput = String(formData.get("image_url") ?? "").trim();
  const instagramUrl = cleanPublicUrl(formData.get("instagram_url"));
  if (!displayName) return back(campaignId, "Add a display name for this outfit.");
  let imageUrl = cleanPublicUrl(imageUrlInput);
  let finalSourceType: FitWarsSourceType = ["upload", "url", "instagram"].includes(sourceType) ? sourceType : "url";
  if (imageFile instanceof File && imageFile.size > 0) {
    imageUrl = await uploadSiteAsset(imageFile, `fit-wars/${campaignId}`);
    finalSourceType = "upload";
  }
  if (!imageUrl) return back(campaignId, sourceType === "instagram" ? "Instagram URLs are recorded for reference, but Street does not scrape Instagram. Upload an approved image or paste a direct image URL." : "Paste a valid public image URL or upload an image.");
  if (sourceType === "instagram" && !instagramUrl) return back(campaignId, "Paste a valid Instagram post or profile URL for the reference field.");
  const body = { campaign_id: campaignId, display_name: displayName, image_url: imageUrl, source_type: finalSourceType, source_url: cleanPublicUrl(formData.get("source_url")) ?? imageUrl, instagram_url: instagramUrl, permission_status: ["pending", "approved", "rejected", "removed"].includes(permissionStatus) ? permissionStatus : "pending", permission_note: cleanFitWarsText(formData.get("permission_note"), 500) || null, is_active: true, updated_at: new Date().toISOString() };
  try {
    if (id) await supabaseRest(`fit_wars_outfits?id=eq.${id}&campaign_id=eq.${campaignId}`, { method: "PATCH", body, prefer: "return=minimal" });
    else await supabaseRest("fit_wars_outfits", { method: "POST", body });
    await recordAudit(actorOf(actor), { action: id ? "fit_wars.outfit_update" : "fit_wars.outfit_create", targetType: "fit_wars_outfit", targetId: id || campaignId, summary: `${id ? "Updated" : "Added"} outfit ${displayName}`, details: { campaignId, displayName, sourceType: finalSourceType, permissionStatus: body.permission_status } });
    revalidatePath(`/admin/fit-wars/${campaignId}`);
    revalidatePath(`/f/${String(formData.get("code") ?? "")}`);
    back(campaignId, undefined, "Outfit saved.");
  } catch (error) {
    back(campaignId, error instanceof Error ? error.message.slice(0, 240) : "The outfit could not be saved.");
  }
}

export async function removeOutfit(formData: FormData) {
  const actor = await requirePermission("analytics.write");
  const campaignId = requiredId(formData, "campaign_id");
  const id = requiredId(formData, "outfit_id");
  await supabaseRest(`fit_wars_outfits?id=eq.${id}&campaign_id=eq.${campaignId}`, { method: "PATCH", body: { is_active: false, permission_status: "removed", updated_at: new Date().toISOString() }, prefer: "return=minimal" });
  await recordAudit(actorOf(actor), { action: "fit_wars.outfit_remove", targetType: "fit_wars_outfit", targetId: id, summary: "Removed an outfit from Fit Wars" });
  revalidatePath(`/admin/fit-wars/${campaignId}`);
  back(campaignId, undefined, "Outfit removed.");
}

export async function saveMatchup(formData: FormData) {
  const actor = await requirePermission("analytics.write");
  const campaignId = requiredId(formData, "campaign_id");
  const id = String(formData.get("matchup_id") ?? "").trim();
  const left = requiredId(formData, "left_outfit_id");
  const right = requiredId(formData, "right_outfit_id");
  const position = Math.max(1, Number(formData.get("position") ?? 1) || 1);
  const duration = Math.min(10000, Math.max(1800, Number(formData.get("duration_ms") ?? 3500) || 3500));
  if (left === right) return back(campaignId, "Choose two different outfits.");
  const body = { campaign_id: campaignId, left_outfit_id: left, right_outfit_id: right, position, duration_ms: duration, is_active: true, updated_at: new Date().toISOString() };
  try {
    if (id) await supabaseRest(`fit_wars_matchups?id=eq.${id}&campaign_id=eq.${campaignId}`, { method: "PATCH", body, prefer: "return=minimal" });
    else await supabaseRest("fit_wars_matchups", { method: "POST", body });
    await recordAudit(actorOf(actor), { action: id ? "fit_wars.matchup_update" : "fit_wars.matchup_create", targetType: "fit_wars_matchup", targetId: id || campaignId, summary: `${id ? "Updated" : "Created"} Fit Wars matchup`, details: { campaignId, position, duration } });
    revalidatePath(`/admin/fit-wars/${campaignId}`);
    back(campaignId, undefined, "Matchup saved.");
  } catch (error) {
    back(campaignId, error instanceof Error && /duplicate|unique/i.test(error.message) ? "That comparison order is already used. Choose another position." : "The matchup could not be saved.");
  }
}

export async function removeMatchup(formData: FormData) {
  const actor = await requirePermission("analytics.write");
  const campaignId = requiredId(formData, "campaign_id");
  const id = requiredId(formData, "matchup_id");
  await supabaseRest(`fit_wars_matchups?id=eq.${id}&campaign_id=eq.${campaignId}`, { method: "PATCH", body: { is_active: false, updated_at: new Date().toISOString() }, prefer: "return=minimal" });
  await recordAudit(actorOf(actor), { action: "fit_wars.matchup_remove", targetType: "fit_wars_matchup", targetId: id, summary: "Removed a Fit Wars matchup" });
  revalidatePath(`/admin/fit-wars/${campaignId}`);
  back(campaignId, undefined, "Matchup removed.");
}

export async function saveCommentary(formData: FormData) {
  const actor = await requirePermission("analytics.write");
  const campaignId = requiredId(formData, "campaign_id");
  const matchupId = requiredId(formData, "matchup_id");
  const id = String(formData.get("commentary_id") ?? "").trim();
  const body = cleanFitWarsText(formData.get("body"), 500);
  if (!body) return back(campaignId, "Add a commentary message.");
  const payload = { matchup_id: matchupId, body, link_label: cleanFitWarsText(formData.get("link_label"), 80) || null, link_url: cleanPublicUrl(formData.get("link_url")) ?? null, position: Math.max(1, Number(formData.get("message_position") ?? 1) || 1), is_active: true, updated_at: new Date().toISOString() };
  if (id) await supabaseRest(`fit_wars_commentaries?id=eq.${id}&matchup_id=eq.${matchupId}`, { method: "PATCH", body: payload, prefer: "return=minimal" });
  else await supabaseRest("fit_wars_commentaries", { method: "POST", body: payload });
  await recordAudit(actorOf(actor), { action: id ? "fit_wars.commentary_update" : "fit_wars.commentary_create", targetType: "fit_wars_commentary", targetId: id || matchupId, summary: `${id ? "Updated" : "Added"} Fit Wars commentary` });
  revalidatePath(`/admin/fit-wars/${campaignId}`);
  back(campaignId, undefined, "Commentary saved.");
}

export async function removeCommentary(formData: FormData) {
  const actor = await requirePermission("analytics.write");
  const campaignId = requiredId(formData, "campaign_id");
  const id = requiredId(formData, "commentary_id");
  await supabaseRest(`fit_wars_commentaries?id=eq.${id}`, { method: "PATCH", body: { is_active: false, updated_at: new Date().toISOString() }, prefer: "return=minimal" });
  await recordAudit(actorOf(actor), { action: "fit_wars.commentary_remove", targetType: "fit_wars_commentary", targetId: id, summary: "Removed Fit Wars commentary" });
  revalidatePath(`/admin/fit-wars/${campaignId}`);
  back(campaignId, undefined, "Commentary removed.");
}
