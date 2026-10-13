"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PALETTE_PAGES } from "@/components/admin/nav-config";
import { Icon } from "@/components/admin/icons";

type Result = { id: string; group: string; label: string; hint?: string; href: string };
type RemoteResults = { brands: Array<{ slug: string; name: string }>; products: Array<{ id: string; title: string; brand: string | null }> };

/** Ctrl/Cmd+K quick finder: jump to any admin page, brand analytics, or a product. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<RemoteResults>({ brands: [], products: [] });
  const [active, setActive] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      setQuery("");
      setRemote({ brands: [], products: [] });
      setActive(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setRemote({ brands: [], products: [] }); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/admin/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (response.ok) setRemote(await response.json());
      } catch { /* aborted or offline: keep the page results */ }
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  const results = useMemo<Result[]>(() => {
    const term = query.trim().toLowerCase();
    const pages = PALETTE_PAGES
      .filter((page) => !term || page.label.toLowerCase().includes(term))
      .slice(0, term ? 6 : 12)
      .map<Result>((page) => ({ id: `page:${page.href}`, group: "Pages", label: page.label, hint: page.hint, href: page.href }));
    const brands = remote.brands.map<Result>((brand) => ({ id: `brand:${brand.slug}`, group: "Brands", label: brand.name, hint: "Brand analytics", href: `/admin/analytics/brands/${brand.slug}` }));
    const products = remote.products.map<Result>((product) => ({ id: `product:${product.id}`, group: "Products", label: product.title, hint: product.brand ?? undefined, href: `/admin/products?status=all&q=${encodeURIComponent(product.title)}` }));
    return [...pages, ...brands, ...products];
  }, [query, remote]);

  useEffect(() => { setActive(0); }, [query]);

  function go(result: Result | undefined) {
    if (!result) return;
    onClose();
    router.push(result.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(index + 1, results.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
    else if (event.key === "Enter") { event.preventDefault(); go(results[active]); }
  }

  let lastGroup = "";
  return (
    <dialog ref={dialogRef} className="adm-palette" aria-label="Quick find" onClose={onClose} onClick={(event) => { if (event.target === dialogRef.current) onClose(); }}>
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Jump to a page, brand or product…"
        role="combobox"
        aria-expanded="true"
        aria-controls="adm-palette-list"
        aria-activedescendant={results[active] ? `adm-palette-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
      />
      <ul id="adm-palette-list" className="adm-palette-list" role="listbox">
        {results.length === 0 ? <li className="adm-palette-empty">No matches</li> : null}
        {results.map((result, index) => {
          const showHeader = result.group !== lastGroup;
          lastGroup = result.group;
          return (
            <Fragment key={result.id}>
              {showHeader ? <li className="adm-palette-group" role="presentation">{result.group}</li> : null}
              <li role="presentation">
                <button
                  id={`adm-palette-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className="adm-palette-item"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(result)}
                >
                  <Icon name="arrow" size={14} />
                  <span>{result.label}</span>
                  {result.hint ? <small>{result.hint}</small> : null}
                </button>
              </li>
            </Fragment>
          );
        })}
      </ul>
      <div className="adm-palette-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span></div>
    </dialog>
  );
}
