"use client";

import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

export function SearchToggle() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const router = useRouter();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => inputRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
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
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const query = value.trim();
    close();
    router.push(query ? `/catalog?q=${encodeURIComponent(query)}` : "/catalog");
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
        <form className="search-overlay-form" onSubmit={submit}>
          <label className="sr-only" htmlFor={`${titleId}-input`}>Search products, colors, styles, or brands</label>
          <input
            id={`${titleId}-input`}
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Try “black jackets” or a brand name"
            autoComplete="off"
            autoFocus
          />
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
