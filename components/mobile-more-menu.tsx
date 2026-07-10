"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * "New in" and "Brands" are hidden under 840px (see .nav-hide-mobile,
 * app/globals.css) because there's no room for them on the compact mobile
 * header — but nothing replaced them, so they were simply unreachable from
 * the header on phones. This renders a small "More" toggle in their place,
 * visible only on mobile (see .mobile-more, same breakpoint), that reveals
 * both links in a dropdown panel styled after the existing
 * components/category-menu.tsx mega-menu.
 */
export function MobileMoreMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mobile-more">
      <button
        type="button"
        className="nav-search-trigger"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
      >
        More
      </button>
      {open ? (
        <>
          <button type="button" className="category-menu-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="category-menu-panel mobile-more-panel" role="dialog" aria-label="More">
            <Link href="/catalog?sort=newest" onClick={() => setOpen(false)}>New in</Link>
            <Link href="/brands" onClick={() => setOpen(false)}>Brands</Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
