"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

// The header search trigger. Opens an overlay with a text input; submitting
// (or pressing Enter) sends the shopper to /catalog?q=... which does a
// case-insensitive title/description match (see app/catalog/page.tsx).
export function SearchToggle() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const query = value.trim();
    setOpen(false);
    router.push(query ? `/catalog?q=${encodeURIComponent(query)}` : "/catalog");
  }

  return (
    <>
      <button type="button" className="nav-search-trigger" aria-label="Search Street" onClick={() => setOpen(true)}>
        Search
      </button>
      {open ? (
        <div className="search-overlay" role="dialog" aria-modal="true" aria-label="Search Street">
          <button type="button" className="search-overlay-backdrop" aria-label="Close search" onClick={() => setOpen(false)} />
          <form className="search-overlay-panel" onSubmit={submit}>
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Search products, styles, brands..."
              aria-label="Search products"
            />
            <button type="submit">Search</button>
          </form>
        </div>
      ) : null}
    </>
  );
}
