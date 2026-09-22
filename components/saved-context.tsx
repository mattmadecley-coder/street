"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type SavedItem = {
  productId: string;
  slug: string;
  title: string;
  brandName: string;
  brandSlug: string;
  price: number;
  image: string;
  sourceUrl: string;
};

type SavedContextValue = {
  items: SavedItem[];
  count: number;
  isSaved: (slug: string) => boolean;
  toggle: (item: SavedItem) => void;
  remove: (slug: string) => void;
  clear: () => void;
};

// Mirrors CartProvider's pattern (localStorage, no account required) so
// saved items work the same way the cart already does -- no server round
// trip, survives a refresh, and needs nothing from the shopper beyond the
// browser they're already using.
const STORAGE_KEY = "street-saved-v1";
const SavedContext = createContext<SavedContextValue | null>(null);

export function SavedProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SavedItem[]>([]);
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
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
  }, [items, hydrated]);

  const value = useMemo<SavedContextValue>(() => ({
    items,
    count: items.length,
    isSaved(slug) {
      return items.some((item) => item.slug === slug);
    },
    toggle(item) {
      setItems((current) => (
        current.some((entry) => entry.slug === item.slug)
          ? current.filter((entry) => entry.slug !== item.slug)
          : [...current, item]
      ));
    },
    remove(slug) {
      setItems((current) => current.filter((entry) => entry.slug !== slug));
    },
    clear() {
      setItems([]);
    },
  }), [items]);

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

export function useSaved() {
  const context = useContext(SavedContext);
  if (!context) throw new Error("useSaved must be used within a SavedProvider");
  return context;
}
