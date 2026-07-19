"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProductVariantSummary } from "@/lib/catalog";
import { useProductVariantFocus } from "@/components/product-variant-context";
import { VariantPicker } from "@/components/variant-picker";
import { ProductPurchaseActions } from "@/components/product-purchase-actions";

export function ProductDetailPanel({ product, recentlyAdded, sourceMessage }: { product: { id: string; slug: string; title: string; brandName: string; brandSlug: string; price: number; compareAtPrice?: number; primaryImage: string; sourceUrl: string; stockStatus: "in_stock" | "sold_out"; isPreorder: boolean; variantCount: number; variants: ProductVariantSummary[]; colors: string[]; sizes: string[]; description: string; category: string; streetCategory?: string; tags: string[]; lastSyncedAt: string }; recentlyAdded: boolean; sourceMessage: string }) {
  const { selectedVariant } = useProductVariantFocus();
  const [saved, setSaved] = useState(false);
  const price = selectedVariant?.price ?? product.price;
  const available = product.stockStatus === "in_stock" && selectedVariant?.available !== false;

  useEffect(() => {
    try { setSaved(JSON.parse(localStorage.getItem("street:saved-products") || "[]").includes(product.slug)); } catch {}
  }, [product.slug]);

  function toggleSaved() {
    try {
      const items: string[] = JSON.parse(localStorage.getItem("street:saved-products") || "[]");
      const next = items.includes(product.slug) ? items.filter((item) => item !== product.slug) : [...items, product.slug];
      localStorage.setItem("street:saved-products", JSON.stringify(next));
      setSaved(next.includes(product.slug));
    } catch {}
  }

  async function share() {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: `${product.title} — ${product.brandName}`, url });
    else await navigator.clipboard?.writeText(url);
  }

  return <aside className="product-info">
    <p className="brand product-brand"><Link href={`/brands/${product.brandSlug}`}>{product.brandName} →</Link></p>
    <h1>{product.title}</h1>
    <div className="product-price-row"><p className="price product-live-price">${price.toFixed(2)}</p>{product.compareAtPrice && product.compareAtPrice > price ? <p className="product-compare-price">${product.compareAtPrice.toFixed(2)}</p> : null}</div>
    <div className="product-status-row"><span className={`status${available ? "" : " product-status-sold"}`}>{available ? "In stock" : "Sold out"}{product.isPreorder ? " · Pre-order" : ""}</span>{recentlyAdded ? <span className="status product-status-new">Just added</span> : null}</div>
    <VariantPicker variants={product.variants} colors={product.colors} sizes={product.sizes} />
    <ProductPurchaseActions product={product} />
    <p className="product-checkout-note">Purchases are currently completed securely on {product.brandName}’s website.</p>
    <div className="product-utility-actions"><button type="button" onClick={toggleSaved}>{saved ? "Saved ✓" : "Save item"}</button><button type="button" onClick={() => void share()}>Share</button></div>
    <div className="product-accordions">
      <details open><summary>Description</summary><p>{product.description || "See the brand website for complete product details."}</p></details>
      <details><summary>Details</summary><p>{[product.streetCategory ?? product.category, product.colors.length ? `Colors: ${product.colors.join(", ")}` : null, product.sizes.length ? `Sizes: ${product.sizes.join(", ")}` : null].filter(Boolean).join(" · ") || "Full product details are available from the brand."}</p></details>
      <details><summary>Shipping & returns</summary><p>Shipping, returns, taxes, and payment are handled directly by {product.brandName}. Confirm final terms before purchasing.</p></details>
      <details><summary>About the listing</summary><p>{sourceMessage} Last checked {new Date(product.lastSyncedAt).toLocaleDateString()}.</p></details>
    </div>
    <div className="mobile-purchase-bar"><div><span>{selectedVariant?.label || product.brandName}</span><strong>${price.toFixed(2)}</strong></div><a href={`/api/out?to=${encodeURIComponent(product.sourceUrl)}&brand=${encodeURIComponent(product.brandSlug)}&product=${encodeURIComponent(product.slug)}&source=product_mobile_bar`} target="_blank" rel="noreferrer" aria-label={`Buy ${product.title} now`}>Buy Now</a></div>
  </aside>;
}
