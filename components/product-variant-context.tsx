"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Shared between ProductGallery and VariantPicker, which sit in two
 * different places in the product-page layout (the gallery and the
 * "Variations" info block, either side of the .product-layout grid) and so
 * can't pass state through props directly without threading it through the
 * server-rendered page. Both are "use client" components; this Provider is
 * the client boundary that wraps them so they can share which photo is
 * currently focused.
 */
type ProductVariantFocus = { focusImage?: string; setFocusImage: (url?: string) => void };

const ProductVariantContext = createContext<ProductVariantFocus | null>(null);

export function ProductVariantProvider({ children }: { children: ReactNode }) {
  const [focusImage, setFocusImage] = useState<string | undefined>(undefined);
  return <ProductVariantContext.Provider value={{ focusImage, setFocusImage }}>{children}</ProductVariantContext.Provider>;
}

export function useProductVariantFocus(): ProductVariantFocus {
  const context = useContext(ProductVariantContext);
  return context ?? { focusImage: undefined, setFocusImage: () => {} };
}
