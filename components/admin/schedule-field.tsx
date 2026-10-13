"use client";

import { useState } from "react";
import styles from "@/app/admin/admin.module.css";

/** A date and time picker in the viewer's own time zone. Submits an exact UTC time in `scheduled_at` (blank when cleared). */
export function ScheduleField({ initialIso, disabled }: { initialIso: string | null; disabled?: boolean }) {
  const toLocalInput = (iso: string | null) => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const [local, setLocal] = useState(toLocalInput(initialIso));
  const iso = local ? new Date(local).toISOString() : "";
  const zone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
  return (
    <div className={styles.field}>
      <label htmlFor="schedule-at">Send at (optional)</label>
      <input id="schedule-at" type="datetime-local" value={local} onChange={(event) => setLocal(event.target.value)} disabled={disabled} />
      <input type="hidden" name="scheduled_at" value={Number.isNaN(Date.parse(iso)) ? "" : iso} />
      <small className={styles.rowMeta}>In your time zone{zone ? ` (${zone})` : ""}. Leave empty to send right away with “Send now”.</small>
    </div>
  );
}
