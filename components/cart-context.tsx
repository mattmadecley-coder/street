"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CartItem = {
  key: string;
  productId: string;
  slug: string;
  title: string;
  brandName: string;
  brandSlug: string;
  price: number;
  image: string;
  sourceUrl: string;
  variantId?: string;
  variantLabel?: string;
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  addItem: (item: Omit<CartItem, "key" | "quantity">) => void;
  removeItem: (key: string) => void;
  setQuantity: (key: string, quantity: number) => void;
  clear: () => void;
};

const STORAGE_KEY = "street-cart-v1";
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setItems(JSON.parse(saved));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const value = useMemo<CartContextValue>(() => ({
    items,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    addItem(item) {
      const key = `${item.productId}:${item.variantId ?? "default"}`;
      setItems((current) => {
        const existing = current.find((entry) => entry.key === key);
        if (existing) return current.map((entry) => entry.key === key ? { ...entry, quantity: entry.quantity + 1 } : entry);
        return [...current, { ...item, key, quantity: 1 }];
      });
    },
    removeItem(key) { setItems((current) => current.filter((item) => item.key !== key)); },
    setQuantity(key, quantity) {
      if (quantity <= 0) return setItems((current) => current.filter((item) => item.key !== key));
      setItems((current) => current.map((item) => item.key === key ? { ...item, quantity: Math.min(99, quantity) } : item));
    },
    clear() { setItems([]); },
  }), [items, hydrated]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
