import Link from "next/link";
import styles from "@/app/admin/admin.module.css";

const LINKS = [
  { href: "/admin/analytics", label: "Overview" },
  { href: "/admin/analytics/comparison", label: "Comparisons" },
  { href: "/admin/analytics/alerts", label: "Alerts" },
];

export function AnalyticsNav({ active, alertCount = 0 }: { active: string; alertCount?: number }) {
  return (
    <nav className={styles.nav} aria-label="Analytics sections" style={{ margin: "16px 0 22px", display: "flex", gap: 8, flexWrap: "wrap" }}>
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} data-active={active === link.href ? "true" : undefined}>
          {link.label}{link.href.endsWith("/alerts") && alertCount > 0 ? ` (${alertCount})` : ""}
        </Link>
      ))}
    </nav>
  );
}
