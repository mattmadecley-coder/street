"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * A submit button that asks for confirmation first (native `confirm()`).
 * Needs to be its own client component — the surrounding admin pages are
 * async Server Components, and `confirm()`/onClick can't live there.
 */
export function ConfirmSubmitButton({ confirmText, children, ...props }: { confirmText: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      type="submit"
      onClick={(event) => {
        if (!confirm(confirmText)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
