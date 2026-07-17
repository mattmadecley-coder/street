"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function MobileNavigation() {
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

  const drawer = open ? (
    <div className="mobile-menu-layer" role="presentation">
      <button className="mobile-menu-backdrop" type="button" aria-label="Close menu" onClick={() => setOpen(false)} />
      <aside id="mobile-menu-drawer" className="mobile-menu-drawer" role="dialog" aria-modal="true" aria-label="Mobile navigation">
        <div className="mobile-menu-head"><strong>STREET</strong><button type="button" onClick={() => setOpen(false)} aria-label="Close menu">×</button></div>
        <nav>
          <Link href="/catalog" onClick={() => setOpen(false)}>Shop all</Link>
          <Link href="/catalog?sort=newest" onClick={() => setOpen(false)}>New in</Link>
          <Link href="/brands" onClick={() => setOpen(false)}>Brands</Link>
          <Link href="/cart" onClick={() => setOpen(false)}>Cart</Link>
        </nav>
        <div className="mobile-menu-secondary">
          <Link href="/brands/apply" onClick={() => setOpen(false)}>Want your brand featured?</Link>
          <a href="mailto:hello@street.com">Contact</a>
          <Link href="/privacy" onClick={() => setOpen(false)}>Privacy &amp; terms</Link>
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
