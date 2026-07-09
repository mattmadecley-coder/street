import Link from "next/link";
import styles from "@/app/admin/admin.module.css";
import { logout } from "@/app/admin/login/actions";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/homepage", label: "Homepage" },
  { href: "/admin/brands", label: "Brands" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/analytics", label: "Analytics" },
];

export function AdminNav({ active }: { active: string }) {
  return (
    <div className={styles.topbar}>
      <div>
        <span className={styles.brand}>STREET ADMIN</span>
        <nav className={styles.nav} style={{ marginTop: 10 }}>
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} data-active={active === link.href ? "true" : undefined}>{link.label}</Link>
          ))}
        </nav>
      </div>
      <form action={logout} className={styles.logout}>
        <button type="submit">Log out</button>
      </form>
    </div>
  );
}
