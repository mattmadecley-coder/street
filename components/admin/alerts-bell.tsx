import Link from "next/link";
import { Icon } from "@/components/admin/icons";
import { getAdminAlertSummary } from "@/lib/admin-alerts";

/** Top-bar bell with the live alert count. Streams in via Suspense so it never delays a page. */
export async function AlertsBell() {
  const { count, critical } = await getAdminAlertSummary();
  const label = count === 0 ? "Alerts: nothing needs attention" : `Alerts: ${count} need attention${critical ? `, ${critical} critical` : ""}`;
  return (
    <Link href="/admin/analytics/alerts" className="adm-icon-btn" aria-label={label} title={label}>
      <Icon name="bell" />
      {count > 0 ? <span className="adm-dot" aria-hidden="true">{count}</span> : null}
    </Link>
  );
}

export function AlertsBellPlaceholder() {
  return (
    <Link href="/admin/analytics/alerts" className="adm-icon-btn" aria-label="Alerts">
      <Icon name="bell" />
    </Link>
  );
}
