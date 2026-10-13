import styles from "@/app/admin/admin.module.css";
import { METRIC_GLOSSARY, type MetricKey } from "@/lib/analytics-glossary";

/** A small "i" that explains a metric on hover or keyboard focus. Pure CSS, so it works in Server Components. */
export function InfoTip({ metric, text }: { metric?: MetricKey; text?: string }) {
  const tip = text ?? (metric ? METRIC_GLOSSARY[metric] : "");
  if (!tip) return null;
  return (
    <span className={styles.infoTip} tabIndex={0} role="note" aria-label={tip} data-tip={tip}>
      i
    </span>
  );
}
