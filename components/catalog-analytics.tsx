"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackStreetEvent } from "@/components/analytics-tracker";

const FILTER_KEYS = ["brand", "group", "category", "type", "color", "size", "availability", "min", "max"] as const;

export function CatalogAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const trackedContext = useRef("");

  useEffect(() => {
    if (pathname !== "/catalog") return;
    const serialized = searchParams.toString();
    if (trackedContext.current === serialized) return;
    trackedContext.current = serialized;

    const activeFilters = Object.fromEntries(
      FILTER_KEYS.flatMap((key) => {
        const value = searchParams.get(key);
        return value ? [[key, value]] : [];
      }),
    );
    const query = searchParams.get("q")?.trim();
    const sort = searchParams.get("sort");

    if (query) void trackStreetEvent("search", { query, sourceComponent: "catalog" });
    if (Object.keys(activeFilters).length) {
      void trackStreetEvent("filter_applied", { metadata: activeFilters, sourceComponent: "catalog_filters" });
    }
    if (sort) void trackStreetEvent("sort_changed", { metadata: { sort }, sourceComponent: "catalog_sort" });
  }, [pathname, searchParams]);

  useEffect(() => {
    if (pathname !== "/catalog") return;
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
          query: searchParams.get("q") || undefined,
          metadata: {
            productSlug: element.dataset.productSlug,
            productTitle: element.dataset.productTitle,
          },
        });
        observer.unobserve(element);
      }
    }, { threshold: [0.5] });

    const products = document.querySelectorAll<HTMLElement>("[data-product-impression]");
    products.forEach((product) => observer.observe(product));
    return () => observer.disconnect();
  }, [pathname, searchParams]);

  return null;
}
