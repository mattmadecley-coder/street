"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { STREET_TAXONOMY, categoriesForGroup, typesForCategory } from "@/lib/street-taxonomy";
import type { Params } from "@/app/catalog/page";

const colors = ["black","white","gray","blue","navy","green","army","brown","tan","cream","red","purple","yellow","pink","camo"];
const sizes = ["XXS","XS","S","M","L","XL","XXL","One Size","4","5","6","7","8","9","10","11","12","13","14","26","28","30","32","34","36","38","40"];

type BrandOption = { slug: string; name: string };

export function MobileCatalogFilters({ params, brands, total }: { params: Params; brands: BrandOption[]; total: number }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [group, setGroup] = useState(params.group ?? "");
  const [category, setCategory] = useState(params.category ?? "");

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [open]);

  const categories = useMemo(() => group ? categoriesForGroup(group) : [], [group]);
  const types = useMemo(() => group && category ? typesForCategory(group, category) : [], [group, category]);
  const activeCount = [params.brand, params.group, params.category, params.type, params.color, params.size, params.min, params.max, params.availability === "all" ? "all" : undefined, params.sort].filter(Boolean).length;

  const drawer = open ? (
    <div className="mobile-filter-layer">
      <button className="mobile-filter-backdrop" type="button" aria-label="Close filters" onClick={() => setOpen(false)} />
      <aside className="mobile-filter-drawer" role="dialog" aria-modal="true" aria-label="Catalog filters">
        <div className="mobile-filter-head"><div><p className="eyebrow">Shop all</p><h2>Filters</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close filters">×</button></div>
        <form action="/catalog" className="mobile-filter-form">
          <input type="hidden" name="q" value={params.q ?? ""} />
          <label>Category group<select name="group" value={group} onChange={(event) => { setGroup(event.target.value); setCategory(""); }}><option value="">All categories</option>{Object.keys(STREET_TAXONOMY).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          {group ? <label>Category<select name="category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All {group}</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label> : null}
          {group && category && types.length ? <label>Type<select name="type" defaultValue={params.type ?? ""}><option value="">All types</option>{types.map((value) => <option key={value} value={value}>{value}</option>)}</select></label> : null}
          <label>Brand<select name="brand" defaultValue={params.brand ?? ""}><option value="">All brands</option>{brands.map((brand) => <option value={brand.slug} key={brand.slug}>{brand.name}</option>)}</select></label>
          <label>Availability<select name="availability" defaultValue={params.availability ?? "in_stock"}><option value="in_stock">In stock only</option><option value="all">Include sold out</option></select></label>
          <label>Sort<select name="sort" defaultValue={params.sort ?? ""}><option value="">Newest</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label>
          <div className="mobile-filter-row"><label>Minimum price<input name="min" type="number" min="0" inputMode="numeric" defaultValue={params.min ?? ""} placeholder="$0" /></label><label>Maximum price<input name="max" type="number" min="0" inputMode="numeric" defaultValue={params.max ?? ""} placeholder="Any" /></label></div>
          <label>Color<select name="color" defaultValue={params.color ?? ""}><option value="">Any color</option>{colors.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
          <label>Size<select name="size" defaultValue={params.size ?? ""}><option value="">Any size</option>{sizes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <div className="mobile-filter-actions"><a href="/catalog">Clear all</a><button type="submit">Show {total.toLocaleString()} pieces</button></div>
        </form>
      </aside>
    </div>
  ) : null;

  return <><button type="button" className="mobile-filter-trigger" onClick={() => setOpen(true)}><span>Filters{activeCount ? ` (${activeCount})` : ""}</span><span>☰</span></button>{mounted && drawer ? createPortal(drawer, document.body) : null}</>;
}
