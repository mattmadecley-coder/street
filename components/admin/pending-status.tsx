"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * "Sync now" and logo/hero uploads can take tens of seconds with the
 * button's pending state as the only signal — that reads as broken past a
 * few seconds. Drop this inside the same <form> as the submit button (it
 * reads pending state from that form via useFormStatus) to show a ticking
 * elapsed-time line while the request is in flight.
 */
export function PendingStatus({ label }: { label: string }) {
  const { pending } = useFormStatus();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!pending) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [pending]);

  if (!pending) return null;
  return (
    <p role="status" aria-live="polite" style={{ margin: "10px 0 0", fontSize: 12, color: "rgba(16,16,16,.6)" }}>
      {label}
      {elapsed > 0 ? ` — ${elapsed}s so far` : ""}
    </p>
  );
}
