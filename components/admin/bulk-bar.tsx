"use client";

import { useEffect, useRef, useState } from "react";
import { bulkProductAction } from "@/app/admin/products/actions";
import { MAX_BULK, type BulkIntent } from "@/lib/product-bulk-shared";

export const BULK_FORM_ID = "bulk-form";

/**
 * Bulk actions for the product list. Each product row carries a checkbox
 * (`input[data-bulk]` that belongs to this form via the `form` attribute); this bar counts them,
 * offers select-all for the current page, and submits the chosen action.
 */
export function BulkBar({ returnTo, canWrite, canDelete, trashOn, showApprove }: { returnTo: string; canWrite: boolean; canDelete: boolean; trashOn: boolean; showApprove: boolean }) {
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const pending = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const recount = () => {
      setTotal(document.querySelectorAll("input[data-bulk]").length);
      setCount(document.querySelectorAll("input[data-bulk]:checked").length);
    };
    recount();
    const onChange = (event: Event) => {
      if ((event.target as HTMLElement | null)?.matches?.("input[data-bulk]")) recount();
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, []);

  function setAll(checked: boolean) {
    document.querySelectorAll<HTMLInputElement>("input[data-bulk]").forEach((box) => { box.checked = checked; });
    setCount(checked ? document.querySelectorAll("input[data-bulk]").length : 0);
  }

  function ask(event: React.MouseEvent<HTMLButtonElement>, intent: BulkIntent) {
    if (intent !== "trash") return;
    event.preventDefault();
    pending.current = event.currentTarget;
    dialogRef.current?.showModal();
  }

  if (!canWrite) return null;
  const over = count > MAX_BULK;
  const disabled = count === 0 || over;

  return (
    <>
      <form ref={formRef} id={BULK_FORM_ID} action={bulkProductAction} className="adm-bulkbar" aria-label="Bulk actions">
        <input type="hidden" name="return_to" value={returnTo} />
        <label className="adm-bulk-all">
          <input type="checkbox" checked={total > 0 && count === total} onChange={(event) => setAll(event.target.checked)} disabled={total === 0} />
          <span>{count === 0 ? `Select all on this page (${total})` : `${count} selected`}</span>
        </label>
        {over ? <span className="adm-bulk-warn" role="alert">Pick at most {MAX_BULK} at a time.</span> : null}
        <div className="adm-bulk-actions">
          {showApprove ? <button type="submit" name="intent" value="approve" className="adm-btn" data-size="sm" disabled={disabled} onClick={(event) => ask(event, "approve")}>Approve classification</button> : null}
          <button type="submit" name="intent" value="hide" className="adm-btn" data-variant="secondary" data-size="sm" disabled={disabled} onClick={(event) => ask(event, "hide")}>Hide from site</button>
          <button type="submit" name="intent" value="unhide" className="adm-btn" data-variant="secondary" data-size="sm" disabled={disabled} onClick={(event) => ask(event, "unhide")}>Show on site</button>
          {canDelete && trashOn ? <button type="submit" name="intent" value="trash" className="adm-btn" data-variant="danger-outline" data-size="sm" disabled={disabled} onClick={(event) => ask(event, "trash")}>Move to trash</button> : null}
        </div>
      </form>

      <dialog ref={dialogRef} className="adm-dialog" aria-labelledby="bulk-confirm-title" onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current?.close(); }}>
        <div className="adm-dialog-body">
          <h2 id="bulk-confirm-title">Move {count} product{count === 1 ? "" : "s"} to the trash?</h2>
          <p>They are hidden from the site straight away and can be restored from Trash.</p>
        </div>
        <div className="adm-dialog-foot">
          <button type="button" className="adm-btn" data-variant="secondary" onClick={() => dialogRef.current?.close()}>Cancel</button>
          <button
            type="button"
            className="adm-btn"
            data-variant="danger"
            onClick={() => {
              dialogRef.current?.close();
              if (formRef.current && pending.current) formRef.current.requestSubmit(pending.current);
            }}
          >
            Move to trash
          </button>
        </div>
      </dialog>
    </>
  );
}
