"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type CategorySummary = { group: string; categories: string[] };

/**
 * Header "Categories" nav item. Desktop: hover or click opens a full-width
 * mega-menu panel with every group laid out as a column of category links.
 * Mobile: the exact same markup, but CSS (see .category-menu-group in
 * globals.css, @media max-width:840px) switches it into a native
 * <details>/<summary> accordion instead of forced-open columns — one tap
 * expands a group, tap a category to go there. No separate mobile
 * component/state needed; it's the same DOM either way.
 */
export function CategoryMenu({ summary }: { summary: CategorySummary[] }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openNow() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }
  // Small delay so moving the mouse from the trigger down toward the panel
  // (crossing a sliver of plain header background on the way) doesn't
  // flicker-close the menu before the cursor lands on it.
  function closeSoon() {
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  }
  // Desktop always shows every group's categories (CSS lays them out as
  // always-open columns); mobile starts each group collapsed so the panel
  // isn't one long scroll of every category at once. Read via matchMedia
  // (not CSS alone) so the underlying <details> genuinely starts
  // open/closed — reliable across browsers, unlike fighting the UA
  // stylesheet for closed <details> content.
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 840px)");
    setIsMobile(query.matches);
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!summary.length) return null;

  return (
    <div className="category-menu" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button
        type="button"
        className="nav-search-trigger"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
      >
        Categories
      </button>
      {open ? (
        <>
          <button type="button" className="category-menu-backdrop" aria-label="Close categories" onClick={() => setOpen(false)} />
          <div className="category-menu-panel" role="dialog" aria-label="Shop by category">
            <div className="category-menu-groups">
              {summary.map(({ group, categories }) => (
                <details key={group} className="category-menu-group" open={!isMobile}>
                  <summary>
                    <Link href={`/catalog?group=${encodeURIComponent(group)}`} onClick={() => setOpen(false)}>{group}</Link>
                  </summary>
                  <ul>
                    {categories.map((category) => (
                      <li key={category}>
                        <Link href={`/catalog?group=${encodeURIComponent(group)}&category=${encodeURIComponent(category)}`} onClick={() => setOpen(false)}>{category}</Link>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
