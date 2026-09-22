"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * A plain `<button type="submit">` that shows pending/disabled state while
 * its Server Action form is submitting. Needs `useFormStatus`, which only
 * reads the nearest parent <form> — so this must render *inside* the form
 * it belongs to, same as any submit button would.
 */
export function SubmitButton({
  children,
  pendingText,
  ...props
}: { children: ReactNode; pendingText?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button {...props} type="submit" disabled={pending || props.disabled} aria-busy={pending}>
      {pending ? (pendingText ?? children) : children}
    </button>
  );
}
