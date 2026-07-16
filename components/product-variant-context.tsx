"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type SelectedProductVariant = {
  externalId: string;
  label: string;
  price: number;
  available: boolean;
  imageUrl?: string;
};

type ProductVariantFocus = {
  focusImage?: string;
  setFocusImage: (url?: string) => void;
  selectedVariant?: SelectedProductVariant;
  setSelectedVariant: (variant?: SelectedProductVariant) => void;
};

const ProductVariantContext = createContext<ProductVariantFocus | null>(null);

export function ProductVariantProvider({ children }: { children: ReactNode }) {
  const [focusImage, setFocusImage] = useState<string | undefined>(undefined);
  const [selectedVariant, setSelectedVariant] = useState<SelectedProductVariant | undefined>(undefined);
  return <ProductVariantContext.Provider value={{ focusImage, setFocusImage, selectedVariant, setSelectedVariant }}>{children}</ProductVariantContext.Provider>;
}

export function useProductVariantFocus(): ProductVariantFocus {
  const context = useContext(ProductVariantContext);
  return context ?? { focusImage: undefined, setFocusImage: () => {}, selectedVariant: undefined, setSelectedVariant: () => {} };
}
