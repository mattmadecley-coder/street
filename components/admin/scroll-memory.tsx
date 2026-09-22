"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Every admin save/hide/sync/move action is a Server Action that ends in
 * `redirect()`. Next.js turns that into a client-side transition rather
 * than a hard browser reload — no `beforeunload` fires — and the redirect
 * target usually carries a fresh `?saved=...`-style query string, so a key
 * built from the full URL stops matching the instant the action succeeds.
 * Keying on the pathname alone survives that; scroll/accordion state is
 * scoped per admin page, not per filter combination.
 *
 * Wrap a row list with this and give each <details> a stable
 * `data-scroll-id` (e.g. the row's id/slug). It restores scroll position
 * and re-opens whichever rows were open before the last save on this page.
 */
export function ScrollMemory({ children, scrollKey }: { children: ReactNode; scrollKey?: string }) {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const key = `street-admin-scroll:${scrollKey ?? pathname}`;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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
      // A Server Action's redirect() is a soft client-side transition, not
      // a real unload — save here too, or the state captured above is lost
      // the moment this component unmounts for the new page.
      save();
      container.removeEventListener("toggle", save, true);
      window.removeEventListener("beforeunload", save);
    };
  }, [key]);

  return <div ref={containerRef}>{children}</div>;
}
