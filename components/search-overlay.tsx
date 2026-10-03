"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";

type BrandOption = { slug: string; name: string };

const MAX_BRAND_SUGGESTIONS = 6;

/**
 * Ranks brands against what's typed so far: an exact name match first, then
 * "starts with" (the most common way someone typing a known brand name
 * actually types it), then the name containing it anywhere, then the slug
 * containing it (covers cases like "SYS-TEMIC" vs slug "sys-temic", or a
 * brand whose display name doesn't start with the part the person remembers).
 * Ties within a tier keep the brands' existing alphabetical order.
 */
function rankBrandMatches(brands: BrandOption[], query: string): BrandOption[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const scored = brands
    .map((brand) => {
      const name = brand.name.toLowerCase();
      const slug = brand.slug.toLowerCase();
      let tier = -1;
      if (name === needle) tier = 0;
      else if (name.startsWith(needle)) tier = 1;
      else if (name.includes(needle)) tier = 2;
      else if (slug.includes(needle.replace(/\s+/g, "-"))) tier = 3;
      return { brand, tier };
    })
    .filter((entry) => entry.tier >= 0)
    .sort((a, b) => a.tier - b.tier);
  return scored.slice(0, MAX_BRAND_SUGGESTIONS).map((entry) => entry.brand);
}

export function SearchToggle() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [value, setValue] = useState("");
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [highlighted, setHighlighted] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const listboxId = `${titleId}-brand-suggestions`;
  const router = useRouter();

  useEffect(() => setMounted(true), []);

  // Same endpoint the mobile filter drawer already uses for its brand
  // dropdown -- a small, hour-cached list, so fetching it here adds no new
  // backend load. Loaded once the overlay is first opened rather than on
  // every page's initial render, since most page loads never open search.
  useEffect(() => {
    if (!open || brands.length) return;
    fetch("/api/filter-options")
      .then((response) => (response.ok ? response.json() : { brands: [] }))
      .then((data) => setBrands(data.brands ?? []))
      .catch(() => setBrands([]));
  }, [open, brands.length]);

  const suggestions = useMemo(() => rankBrandMatches(brands, value), [brands, value]);

  useEffect(() => setHighlighted(-1), [value]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => inputRef.current?.focus());

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [open]);

  function close() {
    setOpen(false);
    setValue("");
    setHighlighted(-1);
  }

  function goToBrand(brand: BrandOption) {
    close();
    router.push(`/brands/${brand.slug}`);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    // Hitting Enter with a suggestion highlighted (arrowed-to, not just the
    // top match) goes to that brand; otherwise Enter falls through to a
    // normal catalog search, since a person who ignored the suggestions is
    // usually searching for a product, not a brand.
    if (highlighted >= 0 && suggestions[highlighted]) {
      goToBrand(suggestions[highlighted]);
      return;
    }
    const query = value.trim();
    close();
    router.push(query ? `/catalog?q=${encodeURIComponent(query)}` : "/catalog");
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    }
  }

  const dialog = open ? (
    <div className="search-overlay">
      <button type="button" className="search-overlay-backdrop" aria-label="Close search" onClick={close} />
      <div
        ref={panelRef}
        className="search-overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="search-overlay-heading">
          <div>
            <p className="search-overlay-kicker">Find your next piece</p>
            <h2 id={titleId}>Search Street</h2>
          </div>
          <button type="button" className="search-overlay-close" aria-label="Close search" onClick={close}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <form className="search-overlay-form" onSubmit={submit} autoComplete="off">
          <div className="search-overlay-field">
            <label className="sr-only" htmlFor={`${titleId}-input`}>Search products, colors, styles, or brands</label>
            <input
              id={`${titleId}-input`}
              ref={inputRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Try “black jackets” or a brand name"
              autoComplete="off"
              autoFocus
              role="combobox"
              aria-expanded={suggestions.length > 0}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={highlighted >= 0 ? `${listboxId}-${highlighted}` : undefined}
            />
            {suggestions.length ? (
              <ul className="search-brand-suggestions" id={listboxId} role="listbox" aria-label="Matching brands">
                {suggestions.map((brand, index) => (
                  <li key={brand.slug} role="option" id={`${listboxId}-${index}`} aria-selected={index === highlighted}>
                    <Link
                      href={`/brands/${brand.slug}`}
                      className={index === highlighted ? "is-highlighted" : undefined}
                      onMouseEnter={() => setHighlighted(index)}
                      onClick={() => close()}
                    >
                      <span className="search-brand-suggestion-label">{brand.name}</span>
                      <span className="search-brand-suggestion-hint">Brand ↗</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button type="submit" className="search-overlay-submit">Search</button>
        </form>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="nav-search-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Search Street"
        onClick={() => setOpen(true)}
      >
        Search
      </button>
      {mounted && dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}
