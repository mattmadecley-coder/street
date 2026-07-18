"use client";

import { useEffect, useRef } from "react";
import { trackStreetEvent } from "@/components/analytics-tracker";

type CatalogContext = {
  query?: string;
  brand?: string;
  group?: string;
  category?: string;
  type?: string;
  color?: string;
  size?: string;
  availability?: string;
  min?: string;
  max?: string;
  sort?: string;
  resultsCount: number;
};

export function CatalogAnalytics({ context }: { context: CatalogContext }) {
  const trackedContext = useRef("");

  useEffect(() => {
    const serialized = JSON.stringify(context);
    if (trackedContext.current === serialized) return;
    trackedContext.current = serialized;

    const activeFilters = Object.fromEntries(
      Object.entries(context).filter(([key, value]) => key !== "resultsCount" && key !== "query" && key !== "sort" && Boolean(value)),
    );

    if (context.query) {
      void trackStreetEvent("search", { query: context.query, resultsCount: context.resultsCount, sourceComponent: "catalog" });
    }
    if (Object.keys(activeFilters).length) {
      void trackStreetEvent("filter_applied", { resultsCount: context.resultsCount, metadata: activeFilters, sourceComponent: "catalog_filters" });
    }
    if (context.sort) {
      void trackStreetEvent("sort_changed", { resultsCount: context.resultsCount, metadata: { sort: context.sort }, sourceComponent: "catalog_sort" });
    }
  }, [context]);

  useEffect(() => {
    const seen = new Set<string>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue;
        const element = entry.target as HTMLElement;
        const productId = element.dataset.productId;
        if (!productId || seen.has(productId)) continue;
        seen.add(productId);
        void trackStreetEvent("product_impression", {
          productId,
          brandSlug: element.dataset.brandSlug,
          sourceComponent: element.dataset.sourceComponent || "product_grid",
          position: element.dataset.position ? Number(element.dataset.position) : undefined,
          query: context.query,
        });
        observer.unobserve(element);
      }
    }, { threshold: [0.5] });

    const products = document.querySelectorAll<HTMLElement>("[data-product-impression]");
    products.forEach((product) => observer.observe(product));
    return () => observer.disconnect();
  }, [context.query]);

  return null;
}
