"use client";

import { useEffect, useState } from "react";
import type { ProductVariantSummary } from "@/lib/catalog";
import { useProductVariantFocus } from "@/components/product-variant-context";

export function VariantPicker({ variants }: { variants: ProductVariantSummary[] }) {
  const { setFocusImage, setSelectedVariant } = useProductVariantFocus();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [needsSelection, setNeedsSelection] = useState(false);

  useEffect(() => {
    const show = () => setNeedsSelection(true);
    window.addEventListener("street:cart-needs-variant", show);
    return () => window.removeEventListener("street:cart-needs-variant", show);
  }, []);

  if (variants.length < 2) return null;

  return (
    <div className={`info-block${needsSelection ? " variant-selection-needed" : ""}`}>
      <p className="brand" style={{ marginTop: 0 }}>Variations ({variants.length})</p>
      {needsSelection ? <p className="variant-help">Select an available option to add this product.</p> : null}
      <div className="variant-list">
        {variants.map((variant) => {
          const label = variant.title || [variant.option1, variant.option2, variant.option3].filter(Boolean).join(" / ") || "Variant";
          const isSelected = selectedId === variant.externalId;
          return (
            <button
              type="button"
              key={variant.externalId}
              className={`variant-chip${variant.available ? "" : " variant-chip-sold-out"}${isSelected ? " variant-chip-selected" : ""}`}
              aria-pressed={isSelected}
              onClick={() => {
                setSelectedId(variant.externalId);
                setNeedsSelection(false);
                setFocusImage(variant.imageUrl);
                setSelectedVariant({ externalId: variant.externalId, label, price: variant.price, available: variant.available, imageUrl: variant.imageUrl });
                window.dispatchEvent(new CustomEvent("street:variant-selected", { detail: { label, available: variant.available } }));
              }}
            >
              {label}{variant.available ? "" : " · Sold out"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
