import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";

export type SiteSettingKey = "hero_image_url" | "hero_video_url" | "featured_brand_slug" | "featured_brand_cta_label";

type SettingRow = { key: string; value: string | null };

const DEFAULTS: Record<SiteSettingKey, string> = {
  hero_image_url: "",
  hero_video_url: "",
  featured_brand_slug: "seventy-four-uniform",
  featured_brand_cta_label: "Shop this brand",
};

/** Reads every site_settings row in one request. Falls back to defaults (and never throws) so a Supabase hiccup never takes the homepage down. */
export async function getSiteSettings(): Promise<Record<SiteSettingKey, string>> {
  const result = { ...DEFAULTS };
  if (!hasSupabaseCatalog()) return result;
  try {
    const rows = await supabaseRest<SettingRow[]>("site_settings?select=key,value");
    for (const row of rows) {
      if (row.key in result) result[row.key as SiteSettingKey] = row.value ?? "";
    }
    return result;
  } catch (error) {
    console.error("Street site settings read failed", error);
    return result;
  }
}

export async function setSiteSetting(key: SiteSettingKey, value: string) {
  if (!hasSupabaseCatalog()) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  await supabaseRest("site_settings?on_conflict=key", {
    method: "POST",
    body: { key, value, updated_at: new Date().toISOString() },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}
