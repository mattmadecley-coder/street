"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function MobileNavigation() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div className="mobile-navigation">
      <button type="button" className="mobile-menu-trigger" aria-expanded={open} aria-controls="mobile-menu-drawer" onClick={() => setOpen(true)}>
        <span aria-hidden="true">☰</span><span className="sr-only">Open menu</span>
      </button>
      {open ? (
        <div className="mobile-menu-layer">
          <button className="mobile-menu-backdrop" type="button" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside id="mobile-menu-drawer" className="mobile-menu-drawer" aria-label="Mobile navigation">
            <div className="mobile-menu-head"><strong>STREET</strong><button type="button" onClick={() => setOpen(false)} aria-label="Close menu">×</button></div>
            <nav>
              <Link href="/catalog" onClick={() => setOpen(false)}>Shop all</Link>
              <Link href="/catalog?sort=newest" onClick={() => setOpen(false)}>New in</Link>
              <Link href="/catalog" onClick={() => setOpen(false)}>Categories</Link>
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
      ) : null}
    </div>
  );
}