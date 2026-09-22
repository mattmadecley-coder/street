"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * A submit button that asks for confirmation first (native `confirm()`)
 * and shows pending/disabled state while its Server Action form is
 * submitting. Needs to be its own client component — the surrounding
 * admin pages are async Server Components, and `confirm()`/onClick/
 * `useFormStatus` can't live there.
 */
export function ConfirmSubmitButton({
  confirmText,
  children,
  pendingText,
  ...props
}: { confirmText: string; children: ReactNode; pendingText?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button
      {...props}
      type="submit"
      disabled={pending || props.disabled}
      aria-busy={pending}
      onClick={(event) => {
        if (!confirm(confirmText)) event.preventDefault();
      }}
    >
      {pending ? (pendingText ?? children) : children}
    </button>
  );
}
