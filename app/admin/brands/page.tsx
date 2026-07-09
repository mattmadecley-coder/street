import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { getBrandDirectory } from "@/lib/catalog-store";
import { updateBrand } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminBrandsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const brands = await getBrandDirectory();

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/brands" />
      <h1 className={styles.title}>Brands</h1>
      <p className={styles.subtitle}>Fix a logo the auto-scraper got wrong, correct a store link, or feature a brand. {brands.length} brands total.</p>

      {saved ? <p className={styles.notice}>Saved {saved}.</p> : null}

      <div className={styles.rowList}>
        {brands.map((brand) => (
          <details key={brand.slug} className={styles.row}>
            <summary className={styles.rowSummary}>
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {brand.logoUrl ? <img src={brand.logoUrl} alt="" /> : <span className={styles.pill}>No logo</span>}
                <strong>{brand.name}</strong>
                {brand.featured ? <span className={styles.pill}>Featured</span> : null}
              </span>
              <span className={styles.rowMeta}>{brand.productCount} pieces</span>
            </summary>
            <div className={styles.rowBody}>
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
                <button type="submit" className={styles.button}>Save {brand.name}</button>
              </form>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
