import Link from "next/link";

const LINKS = [
  { href: "/admin/analytics", label: "Overview" },
  { href: "/admin/analytics/comparison", label: "Comparisons" },
  { href: "/admin/analytics/growth", label: "Growth" },
  { href: "/admin/analytics/alerts", label: "Alerts" },
  { href: "/admin/analytics/glossary", label: "Definitions" },
];

export function AnalyticsNav({ active, alertCount = 0 }: { active: string; alertCount?: number }) {
  return (
    <nav className="adm-tabs" aria-label="Analytics sections">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="adm-tab" aria-current={active === link.href ? "page" : undefined}>
          {link.label}
          {link.href.endsWith("/alerts") && alertCount > 0 ? <span className="adm-badge" data-tone="danger">{alertCount}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
