"use client";

import { useState } from "react";
import type { ProductVariantSummary } from "@/lib/catalog";
import { useProductVariantFocus } from "@/components/product-variant-context";

/**
 * Renders the "Variations (N)" list on the product page as tappable chips
 * instead of inert text. Picking one selects it, focuses its product photo,
 * and emits a lightweight browser event so the mascot can react without the
 * product page and the global mascot needing to share React state directly.
 */
export function VariantPicker({ variants }: { variants: ProductVariantSummary[] }) {
  const { setFocusImage } = useProductVariantFocus();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (variants.length < 2) return null;

  return (
    <div className="info-block">
      <p className="brand" style={{ marginTop: 0 }}>Variations ({variants.length})</p>
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
                setFocusImage(variant.imageUrl);
                window.dispatchEvent(new CustomEvent("street:variant-selected", {
                  detail: { label, available: variant.available },
                }));
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
