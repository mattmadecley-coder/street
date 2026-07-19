"use client";

import { useState } from "react";
import { useCart } from "@/components/cart-context";
import { useProductVariantFocus } from "@/components/product-variant-context";
import { trackStreetEvent } from "@/components/analytics-tracker";

export function ProductPurchaseActions({ product }: { product: {
  id: string; slug: string; title: string; brandName: string; brandSlug: string; price: number; primaryImage: string; sourceUrl: string; stockStatus: "in_stock" | "sold_out"; variantCount: number;
} }) {
  const { addItem } = useCart();
  const { selectedVariant } = useProductVariantFocus();
  const [added, setAdded] = useState(false);
  const requiresVariant = product.variantCount > 1;
  const selectedUnavailable = selectedVariant && !selectedVariant.available;

  function addToCart() {
    if (requiresVariant && !selectedVariant) {
      void trackStreetEvent("add_to_cart_blocked", { productId: product.id, brandSlug: product.brandSlug, sourceComponent: "product_page", metadata: { reason: "variant_required" } });
      window.dispatchEvent(new CustomEvent("street:cart-needs-variant"));
      document.getElementById("product-option-select")?.focus();
      return;
    }
    if (selectedUnavailable || product.stockStatus === "sold_out") return;
    addItem({ productId: product.id, slug: product.slug, title: product.title, brandName: product.brandName, brandSlug: product.brandSlug, price: selectedVariant?.price ?? product.price, image: selectedVariant?.imageUrl || product.primaryImage, sourceUrl: product.sourceUrl, variantId: selectedVariant?.externalId, variantLabel: selectedVariant?.label });
    void trackStreetEvent("add_to_cart", { productId: product.id, brandSlug: product.brandSlug, price: selectedVariant?.price ?? product.price, sourceComponent: "product_page", metadata: { variantId: selectedVariant?.externalId ?? null, variantLabel: selectedVariant?.label ?? null } });
    window.dispatchEvent(new CustomEvent("street:cart-added", { detail: { productId: product.id, title: product.title } }));
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2600);
  }

  const outboundHref = `/api/out?to=${encodeURIComponent(product.sourceUrl)}&brand=${encodeURIComponent(product.brandSlug)}&product=${encodeURIComponent(product.slug)}&source=product_page`;
  return <>
    <div className="purchase-actions">
      <a className="cta" data-mascot-target="shop-button" data-analytics-event="outbound_click_intent" data-analytics-component="product_page" data-analytics-product={product.id} data-analytics-brand={product.brandSlug} href={outboundHref} target="_blank" rel="noreferrer" aria-label={`Buy ${product.title} now`}><span>Buy Now</span><span>↗</span></a>
      <button type="button" className="cta cta-secondary" onClick={addToCart} disabled={product.stockStatus === "sold_out" || Boolean(selectedUnavailable)}><span>{added ? "Added to StreetBag" : "Add to StreetBag"}</span><span>{added ? "✓" : "+"}</span></button>
    </div>
    {added ? <div className="cart-toast" role="status" aria-live="polite"><strong>Added to StreetBag</strong><span>{product.title}{selectedVariant?.label ? ` · ${selectedVariant.label}` : ""}</span><a href="/cart">View StreetBag</a></div> : null}
  </>;
}
