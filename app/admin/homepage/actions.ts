"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setSiteSetting } from "@/lib/site-settings";
import { uploadSiteAsset } from "@/lib/supabase-storage";

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
    setSiteSetting("featured_brand_cta_label", ctaLabel || "Check out their collections"),
  ]);

  revalidatePath("/");
  redirect("/admin/homepage?saved=1");
}
