"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CategorySummary } from "@/lib/catalog-store";
import { typesForCategory } from "@/lib/street-taxonomy";

export function MobileNavigation({ categorySummary }: { categorySummary: CategorySummary[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const close = () => setOpen(false);
  const drawer = open ? (
    <div className="mobile-menu-layer" role="presentation">
      <button className="mobile-menu-backdrop" type="button" aria-label="Close menu" onClick={close} />
      <aside id="mobile-menu-drawer" className="mobile-menu-drawer" role="dialog" aria-modal="true" aria-label="Mobile navigation">
        <div className="mobile-menu-head"><strong>STREET</strong><button type="button" onClick={close} aria-label="Close menu">×</button></div>
        <nav className="mobile-menu-primary">
          <Link href="/catalog" onClick={close}>Shop all</Link>
          <details className="mobile-category-tree">
            <summary>Categories <span aria-hidden="true">+</span></summary>
            <div className="mobile-category-groups">
              {categorySummary.map((group) => (
                <details key={group.group} className="mobile-category-group">
                  <summary>{group.group}<span aria-hidden="true">+</span></summary>
                  <div className="mobile-category-list">
                    <Link href={`/catalog?group=${encodeURIComponent(group.group)}`} onClick={close}>Shop all {group.group}</Link>
                    {group.categories.map((category) => {
                      const types = typesForCategory(group.group, category);
                      return types.length ? (
                        <details key={category} className="mobile-category-item">
                          <summary>{category}<span aria-hidden="true">+</span></summary>
                          <div className="mobile-category-types">
                            <Link href={`/catalog?group=${encodeURIComponent(group.group)}&category=${encodeURIComponent(category)}`} onClick={close}>Shop all {category}</Link>
                            {types.map((type) => (
                              <Link key={type} href={`/catalog?group=${encodeURIComponent(group.group)}&category=${encodeURIComponent(category)}&type=${encodeURIComponent(type)}`} onClick={close}>{type}</Link>
                            ))}
                          </div>
                        </details>
                      ) : (
                        <Link key={category} href={`/catalog?group=${encodeURIComponent(group.group)}&category=${encodeURIComponent(category)}`} onClick={close}>{category}</Link>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>
          </details>
          <Link href="/catalog?sort=newest" onClick={close}>New in</Link>
          <Link href="/brands" onClick={close}>Brands</Link>
          <Link href="/cart" onClick={close}>Cart</Link>
        </nav>
        <div className="mobile-menu-secondary">
          <Link href="/brands/apply" onClick={close}>Get your brand discovered</Link>
          <a href="mailto:hello@street.com">Contact</a>
          <Link href="/privacy" onClick={close}>Privacy &amp; terms</Link>
        </div>
      </aside>
    </div>
  ) : null;

  return (
    <div className="mobile-navigation">
      <button type="button" className="mobile-menu-trigger" aria-expanded={open} aria-controls="mobile-menu-drawer" onClick={() => setOpen((value) => !value)}>
        <span aria-hidden="true">☰</span><span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      </button>
      {mounted && drawer ? createPortal(drawer, document.body) : null}
    </div>
  );
}
