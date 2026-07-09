import Link from "next/link";
import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { getBrandDirectory, getBrandSyncStatuses } from "@/lib/catalog-store";
import { updateBrand, syncBrandNow } from "./actions";

export const dynamic = "force-dynamic";

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

export default async function AdminBrandsPage({ searchParams }: { searchParams: Promise<{ saved?: string; synced?: string; syncError?: string }> }) {
  const { saved, synced, syncError } = await searchParams;
  const [brands, syncStatuses] = await Promise.all([getBrandDirectory(), getBrandSyncStatuses()]);

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/brands" />
      <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 className={styles.title}>Brands</h1>
          <p className={styles.subtitle}>Fix a logo, correct a store link, feature a brand, or check when it last refreshed. {brands.length} brands total.</p>
        </div>
        <Link href="/admin/brands/new" className={styles.button} style={{ textDecoration: "none", whiteSpace: "nowrap" }}>+ Add new brand</Link>
      </div>

      {saved ? <p className={styles.notice}>Saved {saved}.</p> : null}
      {synced ? <p className={syncError ? styles.noticeError : styles.notice}>{syncError ? `Sync failed for ${synced}: ${syncError}` : `Synced ${synced}.`}</p> : null}

      <div className={styles.rowList}>
        {brands.map((brand) => {
          const status = syncStatuses.get(brand.slug);
          return (
            <details key={brand.slug} className={styles.row}>
              <summary className={styles.rowSummary}>
                <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {brand.logoUrl ? <img src={brand.logoUrl} alt="" /> : <span className={styles.pill}>No logo</span>}
                  <strong>{brand.name}</strong>
                  {brand.featured ? <span className={styles.pill}>Featured</span> : null}
                  {!brand.catalogEnabled ? <span className={styles.pill}>Not in daily sync</span> : null}
                  {status?.lastStatus === "failed" ? <span className={styles.pill}>Last sync failed</span> : null}
                </span>
                <span className={styles.rowMeta}>{brand.productCount} pieces · {timeAgo(status?.lastSyncedAt ?? null)}</span>
              </summary>
              <div className={styles.rowBody}>
                {status?.lastStatus === "failed" && status.lastError ? <p className={styles.noticeError}>Last sync error: {status.lastError}</p> : null}
                <form action={syncBrandNow} style={{ marginBottom: 16 }}>
                  <input type="hidden" name="slug" value={brand.slug} />
                  <button type="submit" className={styles.buttonSecondary}>Sync now ({brand.productCount} pieces on file{status?.lastProductCount != null ? `, ${status.lastProductCount} last import` : ""})</button>
                </form>
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
        })}
      </div>
    </div>
  );
}
