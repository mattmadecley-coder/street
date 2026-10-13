import type { BrandMetaMap } from "@/lib/brand-meta";

export type BrandFilter = "all" | "attention" | "no-logo" | "paused" | "closed" | "no-permission" | "asked" | "declined";

export const BRAND_FILTERS: Array<{ value: BrandFilter; label: string }> = [
  { value: "all", label: "All brands" },
  { value: "attention", label: "Needs attention" },
  { value: "no-logo", label: "No logo" },
  { value: "paused", label: "Not in daily sync" },
  { value: "closed", label: "Store closed / password protected" },
  { value: "no-permission", label: "No permission recorded" },
  { value: "asked", label: "Permission: asked, waiting" },
  { value: "declined", label: "Permission: declined / removal" },
];

export function isBrandFilter(value: unknown): value is BrandFilter {
  return typeof value === "string" && BRAND_FILTERS.some((filter) => filter.value === value);
}

/** The few facts about a brand the filters need. Kept small so the logic is easy to test. */
export type FilterableBrand = {
  slug: string;
  name: string;
  logoUrl: string | null;
  catalogEnabled: boolean;
  storefrontStatus: string;
  /** "failed" | "waiting" | other progress states from the import pipeline. */
  progressState: string;
  lastSuccessAt: string | null;
};

const STALE_DAYS = 4;

/** Every word typed must appear in the brand's name or slug (any order, any case). */
export function matchesQuery(brand: Pick<FilterableBrand, "name" | "slug">, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = `${brand.name} ${brand.slug}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function needsAttention(brand: FilterableBrand, nowMs: number): boolean {
  if (brand.progressState === "failed") return true;
  if (!brand.logoUrl) return true;
  if (brand.catalogEnabled && brand.storefrontStatus !== "closed") {
    const last = brand.lastSuccessAt ? new Date(brand.lastSuccessAt).getTime() : 0;
    if (!last || nowMs - last > STALE_DAYS * 86_400_000) return true;
  }
  return false;
}

export function filterBrands<T extends FilterableBrand>(items: T[], filter: BrandFilter, query: string, meta: BrandMetaMap, nowMs: number): T[] {
  return items.filter((brand) => {
    if (!matchesQuery(brand, query)) return false;
    const permission = meta[brand.slug]?.permission ?? "none";
    switch (filter) {
      case "attention": return needsAttention(brand, nowMs);
      case "no-logo": return !brand.logoUrl;
      case "paused": return !brand.catalogEnabled;
      case "closed": return brand.storefrontStatus === "closed";
      case "no-permission": return permission === "none";
      case "asked": return permission === "requested";
      case "declined": return permission === "declined";
      default: return true;
    }
  });
}
