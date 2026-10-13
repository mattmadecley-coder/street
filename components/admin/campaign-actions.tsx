"use client";

import { useState } from "react";
import styles from "@/app/admin/admin.module.css";

type Action = (formData: FormData) => void | Promise<void>;

type Props = {
  save: Action;
  test: Action;
  schedule: Action;
  sendNow: Action;
  canSend: boolean;
  canWrite: boolean;
  audience: number;
  dailyCap: number;
  sentToday: number;
  scheduled: boolean;
  blocked: string | null;
};

/** The campaign's buttons. Sending asks for a plain-language confirmation first, with the real audience size. */
export function CampaignActions({ save, test, schedule, sendNow, canSend, canWrite, audience, dailyCap, sentToday, scheduled, blocked }: Props) {
  const [pending, setPending] = useState(false);
  const room = Math.max(0, dailyCap - sentToday);
  const overCap = audience > room;

  const confirmSend = (event: React.MouseEvent<HTMLButtonElement>) => {
    const parts = [`This will email ${audience.toLocaleString()} ${audience === 1 ? "person" : "people"} right now.`];
    if (overCap) parts.push(`Your daily limit is ${dailyCap.toLocaleString()} and ${sentToday.toLocaleString()} went out in the last 24 hours, so only ${room.toLocaleString()} can go today. The rest send automatically over the next days.`);
    parts.push("Emails cannot be unsent. Have you sent yourself a test?");
    if (!window.confirm(parts.join("\n\n"))) event.preventDefault(); else setPending(true);
  };
  const confirmSchedule = (event: React.MouseEvent<HTMLButtonElement>) => {
    const at = (event.currentTarget.form?.elements.namedItem("scheduled_at") as HTMLInputElement | null)?.value;
    if (!at) { event.preventDefault(); window.alert("Pick a send time first."); return; }
    if (!window.confirm(`Schedule this for ${new Date(at).toLocaleString()}? ${audience.toLocaleString()} ${audience === 1 ? "person" : "people"} match today. The list is checked again when it sends, and anyone who has unsubscribed by then is skipped.`)) event.preventDefault(); else setPending(true);
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="u-row" style={{ gap: 8, flexWrap: "wrap" }}>
        {canWrite ? <button type="submit" formAction={save} className={styles.buttonSecondary} disabled={pending}>Save draft</button> : null}
        {canWrite ? <button type="submit" formAction={test} className={styles.buttonSecondary} disabled={pending}>Send me a test</button> : null}
      </div>
      {canSend ? (
        <div className="u-row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="submit" formAction={schedule} className={styles.button} onClick={confirmSchedule} disabled={pending || Boolean(blocked) || audience === 0}>{scheduled ? "Update schedule" : "Schedule"}</button>
          <button type="submit" formAction={sendNow} className={`${styles.button}`} onClick={confirmSend} disabled={pending || Boolean(blocked) || audience === 0}>Send now</button>
        </div>
      ) : <p className={styles.rowMeta}>You can build and test campaigns. Only an admin or owner can send them.</p>}
      {blocked ? <p className={styles.noticeError} role="alert">{blocked}</p> : null}
      {audience === 0 ? <p className={styles.rowMeta}>Choose a segment with at least one subscribed person to enable sending.</p> : null}
    </div>
  );
}
