"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProductVariantSummary } from "@/lib/catalog";
import { useProductVariantFocus } from "@/components/product-variant-context";

export function VariantPicker({ variants }: { variants: ProductVariantSummary[] }) {
  const { setFocusImage, setSelectedVariant } = useProductVariantFocus();
  const [selectedId, setSelectedId] = useState("");
  const [needsSelection, setNeedsSelection] = useState(false);

  useEffect(() => {
    const show = () => setNeedsSelection(true);
    window.addEventListener("street:cart-needs-variant", show);
    return () => window.removeEventListener("street:cart-needs-variant", show);
  }, []);

  const options = useMemo(() => variants.map((variant) => ({
    variant,
    label: variant.title || [variant.option1, variant.option2, variant.option3].filter(Boolean).join(" / ") || "Option",
  })), [variants]);

  if (variants.length < 2) return null;

  function choose(externalId: string) {
    setSelectedId(externalId);
    const item = options.find(({ variant }) => variant.externalId === externalId);
    if (!item) { setSelectedVariant(undefined); return; }
    const { variant, label } = item;
    setNeedsSelection(false);
    setFocusImage(variant.imageUrl);
    setSelectedVariant({ externalId: variant.externalId, label, price: variant.price, available: variant.available, imageUrl: variant.imageUrl });
    window.dispatchEvent(new CustomEvent("street:variant-selected", { detail: { label, available: variant.available } }));
  }

  return (
    <div className={`product-option-block${needsSelection ? " variant-selection-needed" : ""}`}>
      <label htmlFor="product-option-select">Choose color / size</label>
      {needsSelection ? <p className="variant-help">Select an available option before adding this item.</p> : null}
      <select id="product-option-select" value={selectedId} onChange={(event) => choose(event.target.value)}>
        <option value="">Select an option</option>
        {options.map(({ variant, label }) => <option key={variant.externalId} value={variant.externalId} disabled={!variant.available}>{label}{variant.available ? "" : " — Sold out"}</option>)}
      </select>
    </div>
  );
}
