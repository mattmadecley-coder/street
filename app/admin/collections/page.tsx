import Link from "next/link";
import styles from "@/app/admin/admin.module.css";
import { listCollections } from "@/lib/collections-store";
import { createCollectionAction } from "./actions";
import { requireUser } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export default async function AdminCollectionsPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  await requireUser();
  const { deleted } = await searchParams;
  const collections = await listCollections();

  return (
    <div>
      <h1 className={styles.title}>Collections</h1>
      <p className={styles.subtitle}>Hand-picked capsule or seasonal groupings of specific products. Active collections with at least one product show up as homepage shelves.</p>

      <div className={`${styles.section} u-mt-0`}>
        <div className={styles.sectionHead}><h2>New collection</h2></div>
        <form action={createCollectionAction} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="title">Title</label>
            <input id="title" name="title" type="text" placeholder="e.g. Summer Capsule" required />
          </div>
          <div className={styles.field}>
            <label htmlFor="subtitle">Subtitle (optional)</label>
            <input id="subtitle" name="subtitle" type="text" placeholder="A short line shown under the title" />
          </div>
          <button type="submit" className={styles.button}>Create collection</button>
        </form>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>All collections</h2></div>
        {collections.length ? (
          <table className={styles.table}>
            <thead>
              <tr><th>Title</th><th>Products</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {collections.map((collection) => (
                <tr key={collection.id}>
                  <td>{collection.title}</td>
                  <td>{collection.productCount}</td>
                  <td>{collection.isActive ? <span className={styles.pill}>Active</span> : <span className={styles.pill}>Inactive</span>}</td>
                  <td><Link href={`/admin/collections/${collection.slug}`} className="link-small">Edit</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.rowMeta}>No collections yet — create one above.</p>
        )}
      </div>
    </div>
  );
}
