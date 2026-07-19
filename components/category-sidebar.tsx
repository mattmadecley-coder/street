"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { STREET_TAXONOMY, categoriesForGroup, detailsForType, typesForCategory } from "@/lib/street-taxonomy";
import type { Params } from "@/app/catalog/page";

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
  return catalogHref({ ...params, group: undefined, category: undefined, type: undefined, detail: undefined, size: undefined }, 1);
}

type TaxonomyTarget = { group: string; category?: string; type?: string; detail?: string };

/** Build a self-consistent taxonomy URL and reset pagination. */
function sidebarHref(params: Params, target: TaxonomyTarget) {
  const next: Params = { ...params, page: undefined };
  if (target.detail !== undefined) {
    const isActive = params.detail === target.detail;
    next.group = target.group;
    next.category = target.category;
    next.type = target.type;
    next.detail = isActive ? undefined : target.detail;
  } else if (target.type !== undefined) {
    const isActive = params.type === target.type && !params.detail;
    next.group = target.group;
    next.category = target.category;
    next.type = isActive ? undefined : target.type;
    next.detail = undefined;
  } else if (target.category !== undefined) {
    const isActive = params.category === target.category && !params.type && !params.detail;
    next.group = target.group;
    next.category = isActive ? undefined : target.category;
    next.type = undefined;
    next.detail = undefined;
  } else {
    const isActive = params.group === target.group && !params.category && !params.type && !params.detail;
    next.group = isActive ? undefined : target.group;
    next.category = undefined;
    next.type = undefined;
    next.detail = undefined;
  }
  next.size = undefined;
  return catalogHref(next, 1);
}

export function CategorySidebar({ params }: { params: Params }) {
  const groups = Object.keys(STREET_TAXONOMY);
  const hasFilter = Boolean(params.group || params.category || params.type || params.detail);
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
      {hasFilter ? <p className="sidebar-breadcrumb">{[params.group, params.category, params.type, params.detail].filter(Boolean).join(" / ")}</p> : null}
      {groups.map((group) => {
        const categoriesInGroup = categoriesForGroup(group);
        const isGroupActive = params.group === group && !params.category && !params.type && !params.detail;
        const isOpen = params.group === group || (!isMobile && !params.group && DEFAULT_OPEN_GROUPS.has(group));
        return (
          <details key={group} className="sidebar-group" open={isOpen}>
            <summary><Link href={sidebarHref(params, { group })} className={isGroupActive ? "active" : undefined}>{group}</Link></summary>
            <ul>
              {categoriesInGroup.map((category) => {
                const typesInCategory = typesForCategory(group, category);
                const isCategoryActive = params.category === category && !params.type && !params.detail;
                return (
                  <li key={category}>
                    <Link href={sidebarHref(params, { group, category })} className={isCategoryActive ? "active" : undefined}>{category}</Link>
                    {typesInCategory.length ? (
                      <ul className="sidebar-types">
                        {typesInCategory.map((type) => {
                          const detailsInType = detailsForType(group, category, type);
                          const isTypeActive = params.type === type && !params.detail;
                          return (
                            <li key={type}>
                              <Link href={sidebarHref(params, { group, category, type })} className={isTypeActive ? "active" : undefined}>{type}</Link>
                              {detailsInType.length ? (
                                <ul className="sidebar-types">
                                  {detailsInType.map((detail) => <li key={detail}><Link href={sidebarHref(params, { group, category, type, detail })} className={params.detail === detail ? "active" : undefined}>{detail}</Link></li>)}
                                </ul>
                              ) : null}
                            </li>
                          );
                        })}
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
