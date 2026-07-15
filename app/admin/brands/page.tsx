import Link from "next/link";
import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { SortSelect } from "@/components/admin/sort-select";
import { ClassifyRunner } from "@/components/admin/classify-runner";
import { getBrandDirectory, getBrandSyncStatuses, getBrandClassificationProgress, type StreetBrandProfile, type BrandSyncStatus } from "@/lib/catalog-store";
import { getRecentCatalogDiagnostics, type BrandSyncDiagnostic } from "@/lib/recent-catalog-diagnostics";
import { updateBrand, syncBrandNow } from "./actions";

export const dynamic = "force-dynamic";

type SortKey = "name" | "newest" | "products" | "synced";
const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "name", label: "Name (A–Z)" },
  { value: "newest", label: "Recently added" },
  { value: "products", label: "Most products" },
  { value: "synced", label: "Last synced" },
];

const STALE_IMPORT_MS = 10 * 60_000;
const ACTIVE_CLASSIFICATION_WINDOW_MS = 5 * 60_000;

function timeAgo(iso: string | null): string {
  if (!iso) return "Never synced";
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "Still running";
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function ageMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Date.now() - timestamp);
}

type Progress =
  | { state: "importing" }
  | { state: "classifying"; done: number; total: number }
  | { state: "waiting"; done: number; total: number; pending: number }
  | { state: "finished" }
  | { state: "failed"; error: string | null }
  | { state: "idle" };

function progressFor(brand: StreetBrandProfile, status: BrandSyncStatus | undefined, pending: number, classificationWasStarted: boolean): Progress {
  const syncAge = ageMs(status?.lastSyncedAt);
  const staleRunning = status?.lastStatus === "running" && syncAge !== null && syncAge > STALE_IMPORT_MS;

  if ((status?.lastStatus === "running" && !staleRunning) || (classificationWasStarted && !status)) {
    return { state: "importing" };
  }

  if (staleRunning) {
    return {
      state: "failed",
      error: status?.lastError ?? "This import stopped before it could finish. Use Sync now to retry it.",
    };
  }

  if (status?.lastStatus === "failed") return { state: "failed", error: status.lastError };

  if (pending > 0) {
    const done = Math.max(0, brand.productCount - pending);
    const recentlySynced = status?.lastStatus === "success" && syncAge !== null && syncAge <= ACTIVE_CLASSIFICATION_WINDOW_MS;
    if (classificationWasStarted && recentlySynced) return { state: "classifying", done, total: brand.productCount };
    return { state: "waiting", done, total: brand.productCount, pending };
  }

  if (status?.lastStatus === "success") return { state: "finished" };
  return { state: "idle" };
}

function sortBrands(brands: StreetBrandProfile[], syncStatuses: Map<string, BrandSyncStatus>, sort: SortKey): StreetBrandProfile[] {
  const list = [...brands];
  if (sort === "newest") return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (sort === "products") return list.sort((a, b) => b.productCount - a.productCount);
  if (sort === "synced") {
    return list.sort((a, b) => {
      const aTime = syncStatuses.get(a.slug)?.lastSyncedAt ? new Date(syncStatuses.get(a.slug)!.lastSyncedAt as string).getTime() : 0;
      const bTime = syncStatuses.get(b.slug)?.lastSyncedAt ? new Date(syncStatuses.get(b.slug)!.lastSyncedAt as string).getTime() : 0;
      return bTime - aTime;
    });
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.04em" }}>{value}</p>
      <p className={styles.rowMeta} style={{ margin: "3px 0 0" }}>{label}{note ? ` · ${note}` : ""}</p>
    </div>
  );
}

function SyncDiagnostics({ diagnostic, pending }: { diagnostic: BrandSyncDiagnostic; pending: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(125px, 1fr))", gap: 14, marginBottom: 18, padding: 16, border: "1px solid rgba(16,16,16,.14)", background: "rgba(255,255,255,.38)" }}>
      <Metric label="new products" value={diagnostic.newProducts} />
      <Metric label="existing refreshed" value={diagnostic.existingProducts} />
      <Metric label="total in latest feed" value={diagnostic.totalProducts} />
      <Metric label="sync duration" value={formatDuration(diagnostic.durationMs)} />
      <Metric label="waiting to classify" value={pending} />
      <Metric label="latest sync" value={timeAgo(diagnostic.completedAt ?? diagnostic.startedAt)} note={diagnostic.status} />
    </div>
  );
}

function BrandRow({ brand, status, pending, progress, diagnostic }: { brand: StreetBrandProfile; status: BrandSyncStatus | undefined; pending: number; progress: Progress; diagnostic?: BrandSyncDiagnostic }) {
  return (
    <details className={styles.row}>
      <summary className={styles.rowSummary}>
        <span style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {brand.logoUrl ? <img src={brand.logoUrl} alt="" /> : <span className={styles.pill}>No logo</span>}
          <strong>{brand.name}</strong>
          {brand.featured ? <span className={styles.pill}>Featured</span> : null}
          {!brand.catalogEnabled ? <span className={styles.pill}>Not in daily sync</span> : null}
          {diagnostic?.newProducts ? <span className={styles.pill}>+{diagnostic.newProducts} new</span> : null}
          {progress.state === "failed" ? <span className={styles.pill}>Import interrupted</span> : null}
          {progress.state === "waiting" ? <span className={styles.pill}>{progress.pending} waiting to classify</span> : null}
        </span>
        <span className={styles.rowMeta}>{brand.productCount} pieces · {timeAgo(status?.lastSyncedAt ?? null)}</span>
      </summary>
      <div className={styles.rowBody}>
        {progress.state === "failed" && progress.error ? <p className={styles.noticeError}>{progress.error}</p> : null}
        {progress.state === "waiting" ? (
          <p className={styles.notice}>
            {progress.done} of {progress.total} products are classified. The remaining {progress.pending} are waiting, not actively processing.
          </p>
        ) : null}
        {diagnostic ? <SyncDiagnostics diagnostic={diagnostic} pending={pending} /> : null}
        <div className={styles.actions} style={{ marginBottom: 16 }}>
          <form action={syncBrandNow}>
            <input type="hidden" name="slug" value={brand.slug} />
            <button type="submit" className={styles.buttonSecondary}>Sync now ({brand.productCount} pieces on file{status?.lastProductCount != null ? `, ${status.lastProductCount} last import` : ""})</button>
          </form>
        </div>
        {pending > 0 ? (
          <div style={{ marginBottom: 16 }}>
            <ClassifyRunner brandSlug={brand.slug} pendingCount={pending} />
          </div>
        ) : null}
        <form action={updateBrand} className={styles.form} encType="multipart/form-data">
          <input type="hidden" name="slug" value={brand.slug} />
          <div className={styles.field}>
            <label htmlFor={`store_url_${brand.slug}`}>Store link (used by &ldquo;Shop at {brand.name}&rdquo;)</label>
            <input id={`store_url_${brand.slug}`} name="store_url" type="text" defaultValue={brand.storeUrl} required />
          </div>
          <div className={styles.field}>
            <label htmlFor={`logo_file_${brand.slug}`}>Upload a new logo</label>
            <input id={`logo_file_${brand.slug}`} name="logo_file" type="file" accept="image/*" />
          </div>
          <div className={styles.field}>
            <label htmlFor={`logo_url_${brand.slug}`}>Or paste a logo URL</label>
            <input id={`logo_url_${brand.slug}`} name="logo_url" type="text" placeholder={brand.logoUrl ?? "https://..."} />
          </div>
          <label className={styles.checkboxField}>
            <input type="checkbox" name="is_featured" defaultChecked={brand.featured} />
            Feature on homepage spotlight
          </label>
          <label className={styles.checkboxField}>
            <input type="checkbox" name="catalog_enabled" defaultChecked={brand.catalogEnabled} />
            Include in the daily automatic sync
          </label>
          <button type="submit" className={styles.button}>Save {brand.name}</button>
        </form>
      </div>
    </details>
  );
}

export default async function AdminBrandsPage({ searchParams }: { searchParams: Promise<{ saved?: string; synced?: string; syncError?: string; justAdded?: string; classifying?: string; sort?: string }> }) {
  const { saved, synced, syncError, justAdded, classifying, sort: sortParam } = await searchParams;
  const sort: SortKey = SORT_OPTIONS.some((option) => option.value === sortParam) ? (sortParam as SortKey) : "name";
  const [brands, syncStatuses, pendingByBrand, diagnostics] = await Promise.all([
    getBrandDirectory(),
    getBrandSyncStatuses(),
    getBrandClassificationProgress(),
    getRecentCatalogDiagnostics(),
  ]);

  const classificationStartedSlugs = new Set([justAdded, classifying].filter((slug): slug is string => Boolean(slug)));
  const withProgress = brands.map((brand) => {
    const status = syncStatuses.get(brand.slug);
    const pending = pendingByBrand.get(brand.slug) ?? 0;
    const progress = progressFor(brand, status, pending, classificationStartedSlugs.has(brand.slug));
    const diagnostic = diagnostics.byBrand.get(brand.slug);
    return { brand, status, pending, progress, diagnostic };
  });

  const inProgress = withProgress.filter((item) => item.progress.state === "importing" || item.progress.state === "classifying");
  // If a brand doesn't already appear via its sync status (e.g. the
  // background import hasn't started yet), still surface it right after
  // the wizard hands off.
  if (justAdded && !inProgress.some((item) => item.brand.slug === justAdded)) {
    const match = withProgress.find((item) => item.brand.slug === justAdded);
    if (match && match.progress.state !== "waiting" && match.progress.state !== "failed") {
      inProgress.unshift({ ...match, progress: { state: "importing" } });
    }
  }
  const inProgressSlugs = new Set(inProgress.map((item) => item.brand.slug));
  const recentlyFinished = withProgress
    .filter((item) => item.progress.state === "finished" && !inProgressSlugs.has(item.brand.slug))
    .sort((a, b) => {
      const aTime = a.status?.lastSyncedAt ? new Date(a.status.lastSyncedAt).getTime() : 0;
      const bTime = b.status?.lastSyncedAt ? new Date(b.status.lastSyncedAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 5);

  const allSorted = sortBrands(brands, syncStatuses, sort).map((brand) => {
    const status = syncStatuses.get(brand.slug);
    const pending = pendingByBrand.get(brand.slug) ?? 0;
    return {
      brand,
      status,
      pending,
      progress: progressFor(brand, status, pending, classificationStartedSlugs.has(brand.slug)),
      diagnostic: diagnostics.byBrand.get(brand.slug),
    };
  });

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/brands" />
      {inProgress.length ? <AutoRefresh /> : null}
      <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className={styles.title}>Brands</h1>
          <p className={styles.subtitle}>Fix a logo, correct a store link, feature a brand, or inspect exactly what changed during its latest catalog refresh. {brands.length} brands total.</p>
        </div>
        <Link href="/admin/brands/new" className={styles.button}>+ Add new brand</Link>
      </div>

      {saved ? <p className={styles.notice}>Saved {saved}.</p> : null}
      {synced ? <p className={syncError ? styles.noticeError : styles.notice}>{syncError ? `Sync failed for ${synced}: ${syncError}` : `Synced ${synced}. Classification will continue in the background.`}</p> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16, margin: "18px 0 34px", padding: 20, border: "1px solid #101010" }}>
        <Metric label="products added in the last 24 hours" value={diagnostics.addedLast24Hours} />
        <Metric label="brands with something new" value={diagnostics.brandsWithNewProducts} />
        <Metric label="most recent catalog activity" value={timeAgo(diagnostics.latestSyncAt)} />
        <Metric label="products currently waiting for classification" value={[...pendingByBrand.values()].reduce((sum, count) => sum + count, 0)} />
      </div>

      {inProgress.length ? (
        <div className={styles.section} style={{ marginTop: 0 }}>
          <div className={styles.sectionHead}><h2>Imports in progress</h2></div>
          <div className={styles.rowList}>
            {inProgress.map(({ brand, progress }) => (
              <div key={brand.slug} className={styles.row}>
                <div className={styles.rowSummary} style={{ cursor: "default" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {brand.logoUrl ? <img src={brand.logoUrl} alt="" /> : <span className={styles.pill}>No logo</span>}
                    <strong>{brand.name}</strong>
                  </span>
                  <span className={styles.progressPill}>
                    <span className={styles.progressDot} />
                    {progress.state === "importing" ? "Importing products…" : progress.state === "classifying" ? `Classifying (${progress.done} of ${progress.total})…` : "Working…"}
                  </span>
                </div>
                {progress.state === "classifying" ? (
                  <div className={styles.rowBody} style={{ paddingTop: 0 }}>
                    <div className={styles.miniBarTrack}><div className={styles.miniBarFill} style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} /></div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {recentlyFinished.length ? (
        <div className={styles.section} style={{ marginTop: inProgress.length ? 34 : 0 }}>
          <div className={styles.sectionHead}><h2>Recently finished</h2></div>
          <div className={styles.rowList}>
            {recentlyFinished.map(({ brand, status, pending, progress, diagnostic }) => (
              <BrandRow key={brand.slug} brand={brand} status={status} pending={pending} progress={progress} diagnostic={diagnostic} />
            ))}
          </div>
        </div>
      ) : null}

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>All brands</h2></div>
        <SortSelect defaultValue={sort} />
        <div className={styles.rowList}>
          {allSorted.map(({ brand, status, pending, progress, diagnostic }) => (
            <BrandRow key={brand.slug} brand={brand} status={status} pending={pending} progress={progress} diagnostic={diagnostic} />
          ))}
        </div>
      </div>
    </div>
  );
}
