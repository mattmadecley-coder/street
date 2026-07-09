import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { getCollectionBySlug, searchProductsForPicker } from "@/lib/collections-store";
import { updateCollectionAction, deleteCollectionAction, addProductAction, removeProductAction, moveProductAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminCollectionEditPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ saved?: string; q?: string }> }) {
  const { slug } = await params;
  const { saved, q } = await searchParams;
  const collection = await getCollectionBySlug(slug);
  if (!collection) return notFound();

  const searchResults = q?.trim() ? await searchProductsForPicker(q, 12) : [];
  const inCollectionIds = new Set(collection.products.map((product) => product.id.slice(product.brandSlug.length + 1)));

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/collections" />
      <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className={styles.title}>{collection.title}</h1>
          <p className={styles.subtitle}>{collection.productCount} product{collection.productCount === 1 ? "" : "s"} · <Link href="/admin/collections" className="link-small">Back to all collections</Link></p>
        </div>
      </div>

      {saved ? <p className={styles.notice}>Saved.</p> : null}

      <div className={styles.section} style={{ marginTop: 0 }}>
        <div className={styles.sectionHead}><h2>Details</h2></div>
        <form action={updateCollectionAction} className={styles.form} encType="multipart/form-data">
          <input type="hidden" name="id" value={collection.id} />
          <input type="hidden" name="slug" value={collection.slug} />
          <div className={styles.field}>
            <label htmlFor="title">Title</label>
            <input id="title" name="title" type="text" defaultValue={collection.title} required />
          </div>
          <div className={styles.field}>
            <label htmlFor="subtitle">Subtitle</label>
            <input id="subtitle" name="subtitle" type="text" defaultValue={collection.subtitle ?? ""} />
          </div>
          <div className={styles.field}>
            <label htmlFor="cover_file">Upload a cover image</label>
            <input id="cover_file" name="cover_file" type="file" accept="image/*" />
          </div>
          <div className={styles.field}>
            <label htmlFor="cover_image_url">Or paste a cover image URL</label>
            <input id="cover_image_url" name="cover_image_url" type="text" placeholder={collection.coverImageUrl ?? "https://..."} />
          </div>
          <label className={styles.checkboxField}>
            <input type="checkbox" name="is_active" defaultChecked={collection.isActive} />
            Active (shows on the homepage once it has at least one product)
          </label>
          <div className={styles.actions}>
            <button type="submit" className={styles.button}>Save</button>
          </div>
        </form>
        <form action={deleteCollectionAction} style={{ marginTop: 14 }}>
          <input type="hidden" name="id" value={collection.id} />
          <ConfirmSubmitButton confirmText={`Delete "${collection.title}"? This can't be undone.`} className={styles.buttonSecondary}>
            Delete collection
          </ConfirmSubmitButton>
        </form>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Add products</h2></div>
        <form action={`/admin/collections/${collection.slug}`} className={styles.searchBar}>
          <input type="text" name="q" placeholder="Search by product title…" defaultValue={q ?? ""} />
          <button type="submit">Search</button>
        </form>
        {q?.trim() ? (
          searchResults.length ? (
            <table className={styles.table}>
              <thead><tr><th></th><th>Product</th><th>Brand</th><th>Price</th><th></th></tr></thead>
              <tbody>
                {searchResults.map((product) => {
                  const alreadyIn = inCollectionIds.has(product.id);
                  return (
                    <tr key={product.id}>
                      <td>{product.primaryImageUrl ? <img src={product.primaryImageUrl} alt="" style={{ width: 40, height: 40, objectFit: "contain" }} /> : null}</td>
                      <td>{product.title}</td>
                      <td>{product.brandName}</td>
                      <td>${Number(product.price).toFixed(2)}</td>
                      <td>
                        {alreadyIn ? (
                          <span className={styles.rowMeta}>Already added</span>
                        ) : (
                          <form action={addProductAction}>
                            <input type="hidden" name="collection_id" value={collection.id} />
                            <input type="hidden" name="slug" value={collection.slug} />
                            <input type="hidden" name="product_id" value={product.id} />
                            <button type="submit" className={styles.buttonSecondary}>Add</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className={styles.rowMeta}>No products matched &ldquo;{q}&rdquo;.</p>
          )
        ) : null}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2>Products in this collection</h2></div>
        {collection.products.length ? (
          <table className={styles.table}>
            <thead><tr><th></th><th>Product</th><th>Brand</th><th>Price</th><th></th></tr></thead>
            <tbody>
              {collection.products.map((product, index) => {
                const rawProductId = product.id.slice(product.brandSlug.length + 1);
                return (
                  <tr key={product.id}>
                    <td>{product.primaryImage ? <img src={product.primaryImage} alt="" style={{ width: 40, height: 40, objectFit: "contain" }} /> : null}</td>
                    <td>{product.title}</td>
                    <td>{product.brandName}</td>
                    <td>${product.price.toFixed(2)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <form action={moveProductAction}>
                          <input type="hidden" name="collection_id" value={collection.id} />
                          <input type="hidden" name="slug" value={collection.slug} />
                          <input type="hidden" name="product_id" value={rawProductId} />
                          <input type="hidden" name="direction" value="up" />
                          <button type="submit" className={styles.buttonSecondary} disabled={index === 0} aria-label="Move up">↑</button>
                        </form>
                        <form action={moveProductAction}>
                          <input type="hidden" name="collection_id" value={collection.id} />
                          <input type="hidden" name="slug" value={collection.slug} />
                          <input type="hidden" name="product_id" value={rawProductId} />
                          <input type="hidden" name="direction" value="down" />
                          <button type="submit" className={styles.buttonSecondary} disabled={index === collection.products.length - 1} aria-label="Move down">↓</button>
                        </form>
                        <form action={removeProductAction}>
                          <input type="hidden" name="collection_id" value={collection.id} />
                          <input type="hidden" name="slug" value={collection.slug} />
                          <input type="hidden" name="product_id" value={rawProductId} />
                          <button type="submit" className={styles.buttonSecondary}>Remove</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className={styles.rowMeta}>No products yet — search above to add some.</p>
        )}
      </div>
    </div>
  );
}
