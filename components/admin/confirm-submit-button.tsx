"use client";

import { useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * A submit button that asks for confirmation in a proper dialog first, and
 * shows pending/disabled state while its Server Action form is submitting.
 * Must render inside the <form> it submits (useFormStatus reads the nearest
 * parent form). `confirmText` may contain newlines; they are preserved.
 */
export function ConfirmSubmitButton({
  confirmText,
  confirmTitle = "Are you sure?",
  confirmLabel = "Confirm",
  danger = false,
  children,
  pendingText,
  className,
  ...props
}: {
  confirmText: string;
  confirmTitle?: string;
  confirmLabel?: string;
  danger?: boolean;
  children: ReactNode;
  pendingText?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "onClick">) {
  const { pending } = useFormStatus();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function submit() {
    dialogRef.current?.close();
    const form = buttonRef.current?.form;
    if (form) form.requestSubmit();
  }

  return (
    <>
      <button
        {...props}
        ref={buttonRef}
        type="button"
        className={className}
        disabled={pending || props.disabled}
        aria-busy={pending}
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        {pending ? (pendingText ?? children) : children}
      </button>
      <dialog ref={dialogRef} className="adm-dialog" aria-labelledby="adm-confirm-title" onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current?.close(); }}>
        <div className="adm-dialog-body">
          <h2 id="adm-confirm-title">{confirmTitle}</h2>
          <p>{confirmText}</p>
        </div>
        <div className="adm-dialog-foot">
          <button type="button" className="adm-btn" data-variant="secondary" onClick={() => dialogRef.current?.close()}>Cancel</button>
          <button type="button" className="adm-btn" data-variant={danger ? "danger" : undefined} onClick={submit} autoFocus>{confirmLabel}</button>
        </div>
      </dialog>
    </>
  );
}
