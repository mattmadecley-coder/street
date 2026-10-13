export type HealthLevel = "ok" | "warn" | "bad";

export type HealthItem = { key: string; label: string; level: HealthLevel; detail: string; href?: string };

export type HealthInput = {
  nowMs: number;
  /** Most recent successful catalog sync across all enabled brands, or null if there never was one. */
  lastCatalogSyncMs: number | null;
  /** Brands whose last import failed for a real reason (password-protected stores are expected skips). */
  failingImports: number;
  pendingClassification: number;
  needsReview: number;
  /** Newest tracked analytics event, or null if none. */
  latestEventMs: number | null;
};

const HOUR = 3_600_000;

export function ago(nowMs: number, thenMs: number): string {
  const minutes = Math.max(0, Math.round((nowMs - thenMs) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** Plain-language health of the pipelines that keep the catalog and analytics alive. Pure, so it is easy to test. */
export function evaluateHealth(input: HealthInput): HealthItem[] {
  const { nowMs, lastCatalogSyncMs, failingImports, pendingClassification, needsReview, latestEventMs } = input;
  const items: HealthItem[] = [];

  if (lastCatalogSyncMs === null) {
    items.push({ key: "catalog-sync", label: "Catalog sync", level: "bad", detail: "No successful sync recorded yet.", href: "/admin/brands" });
  } else {
    const age = nowMs - lastCatalogSyncMs;
    items.push({ key: "catalog-sync", label: "Catalog sync", level: age < 36 * HOUR ? "ok" : age < 72 * HOUR ? "warn" : "bad", detail: `Last successful sync ${ago(nowMs, lastCatalogSyncMs)}.`, href: "/admin/brands" });
  }

  items.push({
    key: "brand-imports",
    label: "Brand imports",
    level: failingImports === 0 ? "ok" : "warn",
    detail: failingImports === 0 ? "No imports are failing." : `${failingImports} brand import${failingImports === 1 ? " is" : "s are"} failing.`,
    href: "/admin/brands",
  });

  items.push({
    key: "classification",
    label: "Classification queue",
    level: pendingClassification <= 100 ? "ok" : "warn",
    detail: pendingClassification === 0 ? "Nothing waiting." : `${pendingClassification.toLocaleString()} product${pendingClassification === 1 ? "" : "s"} waiting to be classified.`,
    href: "/admin/products?status=pending",
  });

  items.push({
    key: "review-queue",
    label: "Review queue",
    level: needsReview === 0 ? "ok" : needsReview > 1000 ? "warn" : "ok",
    detail: needsReview === 0 ? "Nothing needs review." : `${needsReview.toLocaleString()} product${needsReview === 1 ? "" : "s"} need a human look.`,
    href: "/admin/products?status=needs_review",
  });

  if (latestEventMs === null) {
    items.push({ key: "tracking", label: "Analytics tracking", level: "bad", detail: "No events have been recorded.", href: "/admin/analytics?tab=health" });
  } else {
    const age = nowMs - latestEventMs;
    items.push({ key: "tracking", label: "Analytics tracking", level: age < 2 * HOUR ? "ok" : age < 6 * HOUR ? "warn" : "bad", detail: `Last event ${ago(nowMs, latestEventMs)}.`, href: "/admin/analytics?tab=health" });
  }

  return items;
}

export function worstLevel(items: HealthItem[]): HealthLevel {
  return items.some((item) => item.level === "bad") ? "bad" : items.some((item) => item.level === "warn") ? "warn" : "ok";
}
