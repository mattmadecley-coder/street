"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSiteSettings, setSiteSetting } from "@/lib/site-settings";
import { readAdminState, writeAdminState } from "@/lib/admin-state";
import { recordReplaced, sanitizeHistory, snapshotsEqual, type HomepageSnapshot } from "@/lib/homepage-history";
import { uploadSiteAsset } from "@/lib/supabase-storage";
import { createHomepageFeatureSchedule, deleteHomepageFeatureSchedule, updateHomepageFeatureSchedule } from "@/lib/homepage-feature-schedule";
import { actorOf, requirePermission } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/audit";

const EASTERN_TIME_ZONE = "America/New_York";

function easternOffsetMinutes(timestamp: number) {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    timeZoneName: "shortOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp)).find((part) => part.type === "timeZoneName")?.value ?? "GMT-5";
  const match = value.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (!match) return -300;
  const sign = match[1] === "+" ? 1 : -1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

function parseEasternDateTime(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error("Choose a valid schedule date and time.");
  const [, year, month, day, hour, minute] = match;
  const localAsUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  let resolved = localAsUtc - easternOffsetMinutes(localAsUtc) * 60_000;
  resolved = localAsUtc - easternOffsetMinutes(resolved) * 60_000;
  const date = new Date(resolved);
  if (!Number.isFinite(date.getTime())) throw new Error("Choose a valid schedule date and time.");
  return date.toISOString();
}

/** A schedule entry only makes sense in the future — enforced here (not just the input's `min`) since that's a client-side hint a stale page load or a direct request can bypass. */
function assertFuture(startsAt: string) {
  if (new Date(startsAt).getTime() <= Date.now()) throw new Error("Start time must be in the future.");
}

async function applySnapshot(snapshot: HomepageSnapshot) {
  await Promise.all([
    setSiteSetting("hero_video_url", snapshot.hero_video_url),
    setSiteSetting("hero_image_url", snapshot.hero_image_url),
    setSiteSetting("featured_brand_slug", snapshot.featured_brand_slug),
    setSiteSetting("featured_brand_cta_label", snapshot.featured_brand_cta_label),
  ]);
}

/** Saves what is about to be replaced so it can be restored. Never blocks a save: history is a convenience. */
async function rememberReplaced(next: HomepageSnapshot, by: string) {
  try {
    const current = await getSiteSettings();
    const replaced: HomepageSnapshot = {
      hero_image_url: current.hero_image_url,
      hero_video_url: current.hero_video_url,
      featured_brand_slug: current.featured_brand_slug,
      featured_brand_cta_label: current.featured_brand_cta_label,
    };
    const { value, available } = await readAdminState<unknown>("homepage_history", { items: [] });
    if (!available) return;
    const history = recordReplaced(sanitizeHistory(value), replaced, next, by, new Date().toISOString());
    await writeAdminState("homepage_history", { items: history });
  } catch (error) {
    console.error("Street homepage history write failed", error);
  }
}

export async function saveHomepageSettings(formData: FormData) {
  const actor = await requirePermission("homepage.write");
  const heroVideoUrl = String(formData.get("hero_video_url") ?? "").trim();
  const heroImageUrlInput = String(formData.get("hero_image_url") ?? "").trim();
  const featuredBrandSlug = String(formData.get("featured_brand_slug") ?? "").trim();
  const ctaLabel = String(formData.get("featured_brand_cta_label") ?? "").trim();
  const heroFile = formData.get("hero_image_file");

  let heroImageUrl = heroImageUrlInput;
  if (heroFile instanceof File && heroFile.size > 0) {
    heroImageUrl = await uploadSiteAsset(heroFile, "hero");
  }

  const next: HomepageSnapshot = {
    hero_video_url: heroVideoUrl,
    hero_image_url: heroImageUrl,
    featured_brand_slug: featuredBrandSlug,
    featured_brand_cta_label: ctaLabel || "Shop this brand",
  };
  await rememberReplaced(next, actor.kind === "legacy" ? "shared password" : actor.email);
  await applySnapshot(next);

  await recordAudit(actorOf(actor), { action: "homepage.update", summary: `Updated the homepage`, targetType: "homepage", details: { featuredBrandSlug, ctaLabel, heroVideoUrl, heroImageUrl } });
  revalidatePath("/");
  redirect("/admin/homepage?saved=1");
}

export async function scheduleHomepageFeature(formData: FormData) {
  const actor = await requirePermission("homepage.write");
  const startsAtInput = String(formData.get("starts_at") ?? "").trim();
  const brandSlug = String(formData.get("scheduled_brand_slug") ?? "").trim();
  const heroVideoUrl = String(formData.get("scheduled_hero_video_url") ?? "").trim();
  const heroImageUrlInput = String(formData.get("scheduled_hero_image_url") ?? "").trim();
  const ctaLabel = String(formData.get("scheduled_cta_label") ?? "").trim();
  const heroFile = formData.get("scheduled_hero_image_file");

  if (!brandSlug) throw new Error("Choose a featured brand.");
  const startsAt = parseEasternDateTime(startsAtInput);
  try {
    assertFuture(startsAt);
  } catch (error) {
    redirect(`/admin/homepage?scheduleError=${encodeURIComponent(error instanceof Error ? error.message : "Invalid schedule")}`);
  }
  let heroImageUrl = heroImageUrlInput;
  if (heroFile instanceof File && heroFile.size > 0) {
    heroImageUrl = await uploadSiteAsset(heroFile, `hero-schedule/${brandSlug}`);
  }

  await createHomepageFeatureSchedule({
    brandSlug,
    startsAt,
    heroImageUrl,
    heroVideoUrl,
    ctaLabel: ctaLabel || "Shop this brand",
  });

  await recordAudit(actorOf(actor), { action: "homepage.schedule", summary: `Scheduled ${brandSlug} on the homepage`, targetType: "homepage", details: { brandSlug, startsAt, ctaLabel } });
  revalidatePath("/");
  revalidatePath("/admin/homepage");
  redirect("/admin/homepage?scheduled=1");
}

export async function updateScheduledFeatureAction(formData: FormData) {
  const actor = await requirePermission("homepage.write");
  const id = String(formData.get("schedule_id") ?? "").trim();
  const startsAtInput = String(formData.get("starts_at") ?? "").trim();
  const brandSlug = String(formData.get("scheduled_brand_slug") ?? "").trim();
  const heroVideoUrl = String(formData.get("scheduled_hero_video_url") ?? "").trim();
  const heroImageUrlInput = String(formData.get("scheduled_hero_image_url") ?? "").trim();
  const ctaLabel = String(formData.get("scheduled_cta_label") ?? "").trim();
  const heroFile = formData.get("scheduled_hero_image_file");

  if (!id) throw new Error("Missing schedule id.");
  if (!brandSlug) throw new Error("Choose a featured brand.");
  const startsAt = parseEasternDateTime(startsAtInput);
  try {
    assertFuture(startsAt);
  } catch (error) {
    redirect(`/admin/homepage?edit=${encodeURIComponent(id)}&scheduleError=${encodeURIComponent(error instanceof Error ? error.message : "Invalid schedule")}`);
  }
  let heroImageUrl = heroImageUrlInput;
  if (heroFile instanceof File && heroFile.size > 0) {
    heroImageUrl = await uploadSiteAsset(heroFile, `hero-schedule/${brandSlug}`);
  }

  await updateHomepageFeatureSchedule(id, {
    brandSlug,
    startsAt,
    heroImageUrl,
    heroVideoUrl,
    ctaLabel: ctaLabel || "Shop this brand",
  });

  await recordAudit(actorOf(actor), { action: "homepage.schedule_update", summary: `Changed a scheduled homepage feature (${brandSlug})`, targetType: "homepage", targetId: id, details: { brandSlug, startsAt, ctaLabel } });
  revalidatePath("/");
  revalidatePath("/admin/homepage");
  redirect("/admin/homepage?scheduleUpdated=1");
}

export async function removeHomepageFeature(formData: FormData) {
  const actor = await requirePermission("homepage.write");
  const id = String(formData.get("schedule_id") ?? "").trim();
  if (id) await deleteHomepageFeatureSchedule(id);
  await recordAudit(actorOf(actor), { action: "homepage.schedule_remove", summary: `Removed a scheduled homepage feature`, targetType: "homepage", targetId: id });
  revalidatePath("/");
  revalidatePath("/admin/homepage");
  redirect("/admin/homepage?deleted=1");
}

/** Puts an earlier fallback homepage back. The settings being replaced are kept in the history too, so a restore can be undone. */
export async function restoreHomepageVersion(formData: FormData) {
  const actor = await requirePermission("homepage.write");
  const at = String(formData.get("at") ?? "");
  const { value, available } = await readAdminState<unknown>("homepage_history", { items: [] });
  if (!available) redirect(`/admin/homepage?scheduleError=${encodeURIComponent("Version history is not enabled yet.")}`);
  const version = sanitizeHistory(value).find((item) => item.at === at);
  if (!version) redirect(`/admin/homepage?scheduleError=${encodeURIComponent("That version was not found.")}`);

  const current = await getSiteSettings();
  const replaced: HomepageSnapshot = { hero_image_url: current.hero_image_url, hero_video_url: current.hero_video_url, featured_brand_slug: current.featured_brand_slug, featured_brand_cta_label: current.featured_brand_cta_label };
  if (!snapshotsEqual(replaced, version.settings)) {
    await rememberReplaced(version.settings, actor.kind === "legacy" ? "shared password" : actor.email);
    await applySnapshot(version.settings);
  }
  await recordAudit(actorOf(actor), { action: "homepage.restore", targetType: "homepage", summary: `Restored the homepage settings from ${at}`, details: { restored: version.settings } });
  revalidatePath("/");
  revalidatePath("/admin/homepage");
  redirect("/admin/homepage?saved=1");
}
