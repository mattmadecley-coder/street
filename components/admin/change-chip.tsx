import styles from "@/app/admin/admin.module.css";
import type { ChangeTone } from "@/lib/analytics-change";

const ARROW: Record<ChangeTone, string> = { up: "▲", down: "▼", flat: "■", none: "" };
const WORD: Record<ChangeTone, string> = { up: "Up", down: "Down", flat: "No change", none: "" };

/** Up/down/flat indicator that never relies on color alone (arrow + text). */
export function ChangeChip({ text, tone }: { text: string; tone: ChangeTone }) {
  return (
    <span className={styles.changeChip} data-tone={tone} aria-label={tone === "none" ? text : `${WORD[tone]} ${text}`}>
      {ARROW[tone] ? <span aria-hidden="true">{ARROW[tone]} </span> : null}
      {text}
    </span>
  );
}
