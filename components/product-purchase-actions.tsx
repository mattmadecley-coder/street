"use client";

import { useState } from "react";
import { useCart } from "@/components/cart-context";
import { useProductVariantFocus } from "@/components/product-variant-context";

export function ProductPurchaseActions({ product }: { product: {
  id: string;
  slug: string;
  title: string;
  brandName: string;
  brandSlug: string;
  price: number;
  primaryImage: string;
  sourceUrl: string;
  stockStatus: "in_stock" | "sold_out";
  variantCount: number;
} }) {
  const { addItem } = useCart();
  const { selectedVariant } = useProductVariantFocus();
  const [added, setAdded] = useState(false);
  const requiresVariant = product.variantCount > 1;
  const selectedUnavailable = selectedVariant && !selectedVariant.available;

  function addToCart() {
    if (requiresVariant && !selectedVariant) {
      window.dispatchEvent(new CustomEvent("street:cart-needs-variant"));
      return;
    }
    if (selectedUnavailable || product.stockStatus === "sold_out") return;
    addItem({
      productId: product.id,
      slug: product.slug,
      title: product.title,
      brandName: product.brandName,
      brandSlug: product.brandSlug,
      price: selectedVariant?.price ?? product.price,
      image: selectedVariant?.imageUrl || product.primaryImage,
      sourceUrl: product.sourceUrl,
      variantId: selectedVariant?.externalId,
      variantLabel: selectedVariant?.label,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }

  return (
    <div className="purchase-actions">
      <button type="button" className="cta cta-secondary" onClick={addToCart} disabled={product.stockStatus === "sold_out" || Boolean(selectedUnavailable)}>
        <span>{added ? "Added to cart" : "Add to cart"}</span><span>{added ? "✓" : "+"}</span>
      </button>
      <a
        className="cta"
        data-mascot-target="shop-button"
        href={`/api/out?to=${encodeURIComponent(product.sourceUrl)}&brand=${encodeURIComponent(product.brandSlug)}&product=${encodeURIComponent(product.slug)}`}
        target="_blank"
        rel="noreferrer"
      >
        <span>Buy now</span><span>↗</span>
      </a>
      {requiresVariant && !selectedVariant ? <p className="purchase-note">Choose an available variation before adding this item to your cart.</p> : null}
      <p className="purchase-note">Street saves your cart here, but checkout still happens on each brand’s website.</p>
    </div>
  );
}
