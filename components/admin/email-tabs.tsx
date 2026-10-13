import Link from "next/link";
import styles from "@/app/admin/admin.module.css";

const TABS = [
  { href: "/admin/email", label: "Overview" },
  { href: "/admin/email/analytics", label: "Analytics" },
  { href: "/admin/email/contacts", label: "Customers" },
  { href: "/admin/email/popup", label: "Signup popup" },
  { href: "/admin/reports", label: "Brand outreach" },
];

export function EmailTabs({ active }: { active: string }) {
  return (
    <nav className={styles.nav} style={{ margin: "4px 0 22px" }} aria-label="Email sections">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} data-active={tab.href === active ? "true" : undefined}>{tab.label}</Link>
      ))}
    </nav>
  );
}
