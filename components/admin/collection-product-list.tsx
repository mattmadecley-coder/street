"use client";

import { useState, useTransition } from "react";
import styles from "@/app/admin/admin.module.css";
import { reorderProductsAction, removeProductAction } from "@/app/admin/collections/actions";
import { SubmitButton } from "@/components/admin/submit-button";

export type CollectionProductItem = {
  rawId: string;
  displayId: string;
  title: string;
  brandName: string;
  price: number;
  primaryImage: string | null;
};

/**
 * Move up/down used to be a plain <form action={moveProductAction}> per
 * button — one full page reload per nudge (punch-list #6). This reorders
 * the local list immediately and persists the whole new order in the
 * background with one request, so reordering several rows in a row feels
 * instant instead of a reload per click.
 */
export function CollectionProductList({ collectionId, slug, initialProducts }: { collectionId: string; slug: string; initialProducts: CollectionProductItem[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [isPending, startTransition] = useTransition();
  const [movingId, setMovingId] = useState<string | null>(null);

  function move(index: number, direction: "up" | "down") {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= products.length) return;
    const next = [...products];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    setProducts(next);
    setMovingId(products[index].rawId);
    startTransition(async () => {
      try {
        await reorderProductsAction(collectionId, next.map((product) => product.rawId));
      } finally {
        setMovingId(null);
      }
    });
  }

  if (!products.length) return <p className={styles.rowMeta}>No products yet — search above to add some.</p>;

  return (
    <table className={styles.table}>
      <thead><tr><th></th><th>Product</th><th>Brand</th><th>Price</th><th /></tr></thead>
      <tbody>
        {products.map((product, index) => (
          <tr key={product.displayId}>
            <td>{product.primaryImage ? <img src={product.primaryImage} alt="" style={{ width: 40, height: 40, objectFit: "contain" }} /> : null}</td>
            <td>{product.title}{isPending && movingId === product.rawId ? <span className={styles.rowMeta}> · moving…</span> : null}</td>
            <td>{product.brandName}</td>
            <td>${product.price.toFixed(2)}</td>
            <td>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button type="button" className={styles.buttonSecondary} disabled={index === 0 || isPending} aria-label="Move up" onClick={() => move(index, "up")}>↑</button>
                <button type="button" className={styles.buttonSecondary} disabled={index === products.length - 1 || isPending} aria-label="Move down" onClick={() => move(index, "down")}>↓</button>
                <form action={removeProductAction}>
                  <input type="hidden" name="collection_id" value={collectionId} />
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="product_id" value={product.rawId} />
                  <SubmitButton pendingText="Removing…" className={styles.buttonSecondary}>Remove</SubmitButton>
                </form>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
