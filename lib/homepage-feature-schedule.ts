import { getSiteSettings, type SiteSettingKey } from "@/lib/site-settings";
import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";

type ScheduleRow = {
  id: string;
  brand_slug: string;
  starts_at: string;
  hero_image_url: string;
  hero_video_url: string;
  cta_label: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type HomepageFeatureSchedule = {
  id: string;
  brandSlug: string;
  startsAt: string;
  heroImageUrl: string;
  heroVideoUrl: string;
  ctaLabel: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EffectiveHomepageSettings = Record<SiteSettingKey, string> & {
  scheduleId: string | null;
  scheduleStartsAt: string | null;
};

function toSchedule(row: ScheduleRow): HomepageFeatureSchedule {
  return {
    id: row.id,
    brandSlug: row.brand_slug,
    startsAt: row.starts_at,
    heroImageUrl: row.hero_image_url ?? "",
    heroVideoUrl: row.hero_video_url ?? "",
    ctaLabel: row.cta_label ?? "",
    enabled: row.is_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getActiveHomepageFeatureSchedule(now = new Date(), noStore = false): Promise<HomepageFeatureSchedule | null> {
  if (!hasSupabaseCatalog()) return null;
  const iso = encodeURIComponent(now.toISOString());
  const rows = await supabaseRest<ScheduleRow[]>(
    `homepage_feature_schedule?select=*&is_enabled=eq.true&starts_at=lte.${iso}&order=starts_at.desc&limit=1`,
    noStore ? { noStore: true } : { revalidateSeconds: 60 },
  );
  return rows[0] ? toSchedule(rows[0]) : null;
}

export async function getHomepageFeatureSchedules(): Promise<HomepageFeatureSchedule[]> {
  if (!hasSupabaseCatalog()) return [];
  const rows = await supabaseRest<ScheduleRow[]>(
    "homepage_feature_schedule?select=*&order=starts_at.asc,created_at.asc&limit=200",
    { noStore: true },
  );
  return rows.map(toSchedule);
}

export async function getEffectiveHomepageSettings(): Promise<EffectiveHomepageSettings> {
  const [settings, scheduled] = await Promise.all([
    getSiteSettings(),
    getActiveHomepageFeatureSchedule(),
  ]);

  if (!scheduled) {
    return { ...settings, scheduleId: null, scheduleStartsAt: null };
  }

  return {
    hero_image_url: scheduled.heroImageUrl || settings.hero_image_url,
    hero_video_url: scheduled.heroVideoUrl || settings.hero_video_url,
    featured_brand_slug: scheduled.brandSlug || settings.featured_brand_slug,
    featured_brand_cta_label: scheduled.ctaLabel || settings.featured_brand_cta_label,
    scheduleId: scheduled.id,
    scheduleStartsAt: scheduled.startsAt,
  };
}

export async function createHomepageFeatureSchedule(input: {
  brandSlug: string;
  startsAt: string;
  heroImageUrl: string;
  heroVideoUrl: string;
  ctaLabel: string;
}) {
  if (!hasSupabaseCatalog()) throw new Error("Supabase is not configured.");
  await supabaseRest("homepage_feature_schedule", {
    method: "POST",
    body: {
      brand_slug: input.brandSlug,
      starts_at: input.startsAt,
      hero_image_url: input.heroImageUrl,
      hero_video_url: input.heroVideoUrl,
      cta_label: input.ctaLabel || "Shop this brand",
      is_enabled: true,
      updated_at: new Date().toISOString(),
    },
    prefer: "return=minimal",
  });
}

export async function deleteHomepageFeatureSchedule(id: string) {
  if (!hasSupabaseCatalog()) throw new Error("Supabase is not configured.");
  await supabaseRest(`homepage_feature_schedule?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
}
