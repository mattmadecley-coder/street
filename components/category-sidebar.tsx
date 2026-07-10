"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { STREET_TAXONOMY, categoriesForGroup, typesForCategory } from "@/lib/street-taxonomy";
import type { Params } from "@/app/catalog/page";

// Groups shown expanded by default on desktop (no filter selected yet) —
// mirrors GOAT defaulting to its two biggest departments open in the
// sidebar. This used to apply unconditionally, which meant three fully
// expanded taxonomy trees rendered inline above the product grid on mobile
// (the sidebar collapses to a static, full-width block under 840px — see
// .catalog-layout / .sidebar in globals.css), pushing the grid ~2000px down.
// Gated behind matchMedia here, the same way components/category-menu.tsx
// already does for the header's "Categories" dropdown, so mobile starts
// every group collapsed instead.
const DEFAULT_OPEN_GROUPS = new Set(["Footwear", "Apparel", "Collectibles"]);

function catalogHref(params: Params, page: number) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key !== "page" && value) search.set(key, value as string);
  }
  if (page > 1) search.set("page", String(page));
  const query = search.toString();
  return query ? `/catalog?${query}` : "/catalog";
}

function clearCategoryHref(params: Params) {
  return catalogHref({ ...params, group: undefined, category: undefined, type: undefined, size: undefined }, 1);
}

/**
 * Href for a sidebar category link. Every link carries its full ancestor
 * chain (a type link sets group+category+type, not just type) so the URL is
 * always self-consistent even though category/type names happen to be
 * unique across the whole taxonomy. Clicking the already-active leaf toggles
 * it off and collapses back to its parent level, instead of re-selecting it
 * — the same "click to filter, click again to clear" pattern GOAT's own
 * category sidebar uses.
 */
function sidebarHref(params: Params, target: { group: string; category?: string; type?: string }) {
  const next: Params = { ...params, page: undefined };
  if (target.type !== undefined) {
    const isActive = params.type === target.type;
    next.group = target.group;
    next.category = target.category;
    next.type = isActive ? undefined : target.type;
  } else if (target.category !== undefined) {
    const isActive = params.category === target.category && !params.type;
    next.group = target.group;
    next.category = isActive ? undefined : target.category;
    next.type = undefined;
  } else {
    const isActive = params.group === target.group && !params.category && !params.type;
    next.group = isActive ? undefined : target.group;
    next.category = undefined;
    next.type = undefined;
  }
  // A group/category change can invalidate the previously-selected size
  // (e.g. leaving Footwear should drop a shoe size), so size is cleared
  // whenever the taxonomy selection changes.
  next.size = undefined;
  const search = new URLSearchParams();
  for (const [key, val] of Object.entries(next)) if (val) search.set(key, val as string);
  const query = search.toString();
  return query ? `/catalog?${query}` : "/catalog";
}

/** GOAT-style nested category sidebar, driven entirely by STREET_TAXONOMY. */
export function CategorySidebar({ params }: { params: Params }) {
  const groups = Object.keys(STREET_TAXONOMY);
  const hasFilter = Boolean(params.group || params.category || params.type);

  // Desktop keeps DEFAULT_OPEN_GROUPS expanded, same as before. Mobile starts
  // every group collapsed regardless of DEFAULT_OPEN_GROUPS, so the sidebar
  // reads as a short list of tappable groups instead of a wall of links.
  // Read via matchMedia (not CSS alone) so the underlying <details> genuinely
  // starts open/closed — same approach as components/category-menu.tsx.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 840px)");
    setIsMobile(query.matches);
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <nav className="sidebar" aria-label="Shop by category">
      <div className="sidebar-head">
        <p className="sidebar-heading">Category</p>
        {hasFilter ? <Link href={clearCategoryHref(params)} className="sidebar-reset">Reset</Link> : null}
      </div>
      {hasFilter ? (
        <p className="sidebar-breadcrumb">{[params.group, params.category, params.type].filter(Boolean).join(" / ")}</p>
      ) : null}
      {groups.map((group) => {
        const categoriesInGroup = categoriesForGroup(group);
        const isGroupActive = params.group === group && !params.category && !params.type;
        const isOpen = params.group === group || (!isMobile && !params.group && DEFAULT_OPEN_GROUPS.has(group));
        return (
          <details key={group} className="sidebar-group" open={isOpen}>
            <summary>
              <Link href={sidebarHref(params, { group })} className={isGroupActive ? "active" : undefined}>{group}</Link>
            </summary>
            <ul>
              {categoriesInGroup.map((category) => {
                const typesInCategory = typesForCategory(group, category);
                const isCategoryActive = params.category === category && !params.type;
                return (
                  <li key={category}>
                    <Link href={sidebarHref(params, { group, category })} className={isCategoryActive ? "active" : undefined}>{category}</Link>
                    {typesInCategory.length ? (
                      <ul className="sidebar-types">
                        {typesInCategory.map((type) => (
                          <li key={type}>
                            <Link href={sidebarHref(params, { group, category, type })} className={params.type === type ? "active" : undefined}>{type}</Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </nav>
  );
}
