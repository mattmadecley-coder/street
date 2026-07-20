"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackStreetEvent } from "@/components/analytics-tracker";

const FILTER_KEYS = ["brand", "group", "category", "type", "detail", "color", "size", "availability", "min", "max"] as const;

function catalogResultsCount() {
  const label = document.querySelector<HTMLElement>(".catalog-top .results")?.textContent ?? "";
  const match = label.match(/of\s+([\d,]+)\s+pieces/i);
  if (!match) return undefined;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

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
    const group = searchParams.get("group") || undefined;
    const category = searchParams.get("category") || undefined;
    const type = searchParams.get("type") || undefined;
    const detail = searchParams.get("detail") || undefined;

    if (query) {
      void trackStreetEvent("search", { query, resultsCount: catalogResultsCount(), sourceComponent: "catalog" });
    } else if (group || category || type || detail) {
      void trackStreetEvent("category_view", {
        streetGroup: group,
        streetCategory: category,
        sourceComponent: "catalog",
        metadata: { type: type ?? null, detail: detail ?? null },
      });
    }
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
