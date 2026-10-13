"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { bulkMessage, isBulkIntent } from "@/lib/product-bulk-shared";

type Tone = "success" | "error" | "info";
type ToastItem = { id: number; message: string; tone: Tone };
type ToastApi = { toast: (message: string, tone?: Tone) => void };

const ToastContext = createContext<ToastApi>({ toast: () => undefined });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const toast = useCallback((message: string, tone: Tone = "success") => {
    const id = nextId.current++;
    setItems((current) => [...current.slice(-3), { id, message, tone }]);
    window.setTimeout(() => dismiss(id), tone === "error" ? 9000 : 4500);
  }, [dismiss]);
  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="adm-toasts" role="region" aria-label="Notifications">
        {items.map((item) => (
          <div key={item.id} className="adm-toast" data-tone={item.tone} role={item.tone === "error" ? "alert" : "status"}>
            <span className="adm-toast-msg">{item.message}</span>
            <button type="button" onClick={() => dismiss(item.id)} aria-label="Dismiss notification">✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Query-string flags the admin Server Actions redirect with, and the toast each one produces. */
const SUCCESS_PARAMS: Record<string, string | ((value: string) => string)> = {
  saved: (value) => (value === "deleted" ? "Deleted." : "Saved."),
  deleted: "Deleted.",
  scheduled: "Added to the schedule.",
  scheduleUpdated: "Schedule updated.",
  tested: "Test email sent.",
  sent: (value) => (/^\d+$/.test(value) && value !== "1" ? `Sent ${value} emails.` : "Email sent."),
  skipped: "Skipped.",
  contact: "Contact saved.",
  justAdded: (value) => `Brand "${value}" added.`,
  bulk: (value) => {
    const [intent, changed, skipped] = value.split(":");
    return isBulkIntent(intent) ? bulkMessage(intent, Number(changed) || 0, Number(skipped) || 0) : "Done.";
  },
};

/**
 * Turns `?saved=1`-style success redirects from Server Actions into a toast, then removes the flag from the URL.
 * Errors stay inline on their page on purpose: they must still be there after a refresh.
 */
export function UrlToast() {
  const { toast } = useToast();
  const params = useSearchParams();
  const pathname = usePathname();
  const handled = useRef(new Set<string>());

  useEffect(() => {
    const key = `${pathname}?${params.toString()}`;
    if (handled.current.has(key)) return;
    handled.current.add(key);

    const next = new URLSearchParams(params.toString());
    let changed = false;
    for (const [name, message] of Object.entries(SUCCESS_PARAMS)) {
      const value = params.get(name);
      if (value === null) continue;
      toast(typeof message === "function" ? message(value) : message, "success");
      next.delete(name);
      changed = true;
    }
    if (changed) {
      const query = next.toString();
      window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    }
  }, [params, pathname, toast]);

  return null;
}
