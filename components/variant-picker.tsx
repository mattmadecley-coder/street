"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProductVariantSummary } from "@/lib/catalog";
import { useProductVariantFocus } from "@/components/product-variant-context";

type OptionGroup = { index: 0 | 1 | 2; label: string; values: string[] };

function normalized(values: string[]) {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export function VariantPicker({ variants, colors = [], sizes = [] }: { variants: ProductVariantSummary[]; colors?: string[]; sizes?: string[] }) {
  const { setFocusImage, setSelectedVariant } = useProductVariantFocus();
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [needsSelection, setNeedsSelection] = useState(false);

  useEffect(() => {
    const show = () => setNeedsSelection(true);
    window.addEventListener("street:cart-needs-variant", show);
    return () => window.removeEventListener("street:cart-needs-variant", show);
  }, []);

  const groups = useMemo<OptionGroup[]>(() => {
    const colorSet = normalized(colors);
    const sizeSet = normalized(sizes);
    return ([0, 1, 2] as const).flatMap((index) => {
      const values = [...new Set(variants.map((variant) => [variant.option1, variant.option2, variant.option3][index]).filter((value): value is string => Boolean(value && value !== "Default Title")))];
      if (!values.length) return [];
      const colorMatches = values.filter((value) => colorSet.has(value.toLowerCase())).length;
      const sizeMatches = values.filter((value) => sizeSet.has(value.toLowerCase())).length;
      const label = colorMatches >= Math.max(1, values.length / 2) ? "Color" : sizeMatches >= Math.max(1, values.length / 2) ? "Size" : index === 0 ? "Style" : `Option ${index + 1}`;
      return [{ index, label, values }];
    });
  }, [variants, colors, sizes]);

  if (variants.length < 2) return null;

  function optionValue(variant: ProductVariantSummary, index: number) {
    return [variant.option1, variant.option2, variant.option3][index];
  }

  function isPossible(index: number, value: string) {
    return variants.some((variant) => variant.available && groups.every((group) => {
      if (group.index === index) return optionValue(variant, group.index) === value;
      const chosen = selected[group.index];
      return !chosen || optionValue(variant, group.index) === chosen;
    }));
  }

  function choose(index: number, value: string) {
    const next = { ...selected, [index]: value };
    setSelected(next);
    setNeedsSelection(false);
    const exact = variants.find((variant) => groups.every((group) => optionValue(variant, group.index) === next[group.index]));
    if (!exact) {
      setSelectedVariant(undefined);
      const imageMatch = variants.find((variant) => optionValue(variant, index) === value && variant.imageUrl);
      setFocusImage(imageMatch?.imageUrl);
      return;
    }
    const label = groups.map((group) => next[group.index]).filter(Boolean).join(" / ") || exact.title || "Selected option";
    setFocusImage(exact.imageUrl);
    setSelectedVariant({ externalId: exact.externalId, label, price: exact.price, available: exact.available, imageUrl: exact.imageUrl });
    window.dispatchEvent(new CustomEvent("street:variant-selected", { detail: { label, available: exact.available } }));
  }

  return (
    <div className={`product-option-block${needsSelection ? " variant-selection-needed" : ""}`} id="product-option-select" tabIndex={-1}>
      {groups.map((group) => (
        <fieldset className="product-option-group" key={group.index}>
          <legend>{group.label}{selected[group.index] ? <span>{selected[group.index]}</span> : null}</legend>
          <div className="variant-list">
            {group.values.map((value) => {
              const possible = isPossible(group.index, value);
              const active = selected[group.index] === value;
              return <button key={value} type="button" className={`variant-chip${active ? " variant-chip-selected" : ""}${!possible ? " variant-chip-sold-out" : ""}`} aria-pressed={active} disabled={!possible} onClick={() => choose(group.index, value)}>{value}</button>;
            })}
          </div>
        </fieldset>
      ))}
      {needsSelection ? <p className="variant-help">Select the available options above before saving this item.</p> : null}
    </div>
  );
}
