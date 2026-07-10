"use client";

import { useState } from "react";
import type { ProductVariantSummary } from "@/lib/catalog";
import { useProductVariantFocus } from "@/components/product-variant-context";

/**
 * Renders the "Variations (N)" list on the product page as tappable chips
 * instead of inert text. Picking one selects it (visually) and, when that
 * variant has an associated photo (see lib/source-import.ts - not every
 * source provides this), tells ProductGallery to jump to it via the shared
 * context in product-variant-context.tsx. Street doesn't sell directly, so
 * sold-out variants stay selectable - there's no cart step where that
 * would matter, and a shopper may still want to see what a sold-out
 * colorway looked like.
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
