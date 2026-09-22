"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Every admin save/hide/sync/move action is a Server Action that ends in
 * `redirect()`, which reloads the whole page. Without this, that reload
 * snaps scroll back to the top and closes every open <details> row —
 * annoying when you're 40 rows down a review queue and just hit Save.
 *
 * Wrap a row list with this and give each <details> a stable
 * `data-scroll-id` (e.g. the row's id/slug). It restores scroll position
 * and re-opens whichever rows were open, keyed by the current URL so it
 * doesn't leak state between different searches/filters/pages.
 *
 * Reads `window.location.search` directly (rather than `useSearchParams`)
 * so this never needs its own Suspense boundary.
 */
export function ScrollMemory({ children, scrollKey }: { children: ReactNode; scrollKey?: string }) {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const search = typeof window !== "undefined" ? window.location.search : "";
    const key = `street-admin-scroll:${scrollKey ?? `${pathname}${search}`}`;

    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const state = JSON.parse(raw) as { scrollY?: number; openIds?: string[] };
        if (state.openIds?.length) {
          for (const id of state.openIds) {
            const el = container.querySelector<HTMLDetailsElement>(`details[data-scroll-id="${CSS.escape(id)}"]`);
            if (el) el.open = true;
          }
        }
        if (typeof state.scrollY === "number") {
          requestAnimationFrame(() => window.scrollTo(0, state.scrollY as number));
        }
      }
    } catch {
      // sessionStorage unavailable or corrupt state — nothing to restore, carry on.
    }

    function save() {
      try {
        const openIds: string[] = [];
        container?.querySelectorAll("details[open][data-scroll-id]").forEach((el) => {
          const id = el.getAttribute("data-scroll-id");
          if (id) openIds.push(id);
        });
        sessionStorage.setItem(key, JSON.stringify({ scrollY: window.scrollY, openIds }));
      } catch {
        // best-effort only
      }
    }

    // `toggle` doesn't bubble in every browser, so listen on the capture
    // phase — capture still fires on the way down regardless of bubbling.
    container.addEventListener("toggle", save, true);
    window.addEventListener("beforeunload", save);
    return () => {
      container.removeEventListener("toggle", save, true);
      window.removeEventListener("beforeunload", save);
    };
  }, [pathname, scrollKey]);

  return <div ref={containerRef}>{children}</div>;
}
