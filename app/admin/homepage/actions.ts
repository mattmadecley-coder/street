"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setSiteSetting } from "@/lib/site-settings";
import { uploadSiteAsset } from "@/lib/supabase-storage";
import { createHomepageFeatureSchedule, deleteHomepageFeatureSchedule } from "@/lib/homepage-feature-schedule";

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

export async function saveHomepageSettings(formData: FormData) {
  const heroVideoUrl = String(formData.get("hero_video_url") ?? "").trim();
  const heroImageUrlInput = String(formData.get("hero_image_url") ?? "").trim();
  const featuredBrandSlug = String(formData.get("featured_brand_slug") ?? "").trim();
  const ctaLabel = String(formData.get("featured_brand_cta_label") ?? "").trim();
  const heroFile = formData.get("hero_image_file");

  let heroImageUrl = heroImageUrlInput;
  if (heroFile instanceof File && heroFile.size > 0) {
    heroImageUrl = await uploadSiteAsset(heroFile, "hero");
  }

  await Promise.all([
    setSiteSetting("hero_video_url", heroVideoUrl),
    setSiteSetting("hero_image_url", heroImageUrl),
    setSiteSetting("featured_brand_slug", featuredBrandSlug),
    setSiteSetting("featured_brand_cta_label", ctaLabel || "Shop this brand"),
  ]);

  revalidatePath("/");
  redirect("/admin/homepage?saved=1");
}

export async function scheduleHomepageFeature(formData: FormData) {
  const startsAtInput = String(formData.get("starts_at") ?? "").trim();
  const brandSlug = String(formData.get("scheduled_brand_slug") ?? "").trim();
  const heroVideoUrl = String(formData.get("scheduled_hero_video_url") ?? "").trim();
  const heroImageUrlInput = String(formData.get("scheduled_hero_image_url") ?? "").trim();
  const ctaLabel = String(formData.get("scheduled_cta_label") ?? "").trim();
  const heroFile = formData.get("scheduled_hero_image_file");

  if (!brandSlug) throw new Error("Choose a featured brand.");
  const startsAt = parseEasternDateTime(startsAtInput);
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

  revalidatePath("/");
  revalidatePath("/admin/homepage");
  redirect("/admin/homepage?scheduled=1");
}

export async function removeHomepageFeature(formData: FormData) {
  const id = String(formData.get("schedule_id") ?? "").trim();
  if (id) await deleteHomepageFeatureSchedule(id);
  revalidatePath("/");
  revalidatePath("/admin/homepage");
  redirect("/admin/homepage?deleted=1");
}
