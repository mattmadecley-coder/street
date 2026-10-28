import type { IconName } from "@/components/admin/icons";
import type { Permission } from "@/lib/admin-permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Extra pathname prefixes that should also highlight this item. */
  also?: string[];
  /** When true only an exact pathname match highlights it. */
  exact?: boolean;
  /** Only shown to roles that hold this permission. */
  permission?: Permission;
};

export type NavGroup = { label: string | null; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [{ href: "/admin", label: "Home", icon: "home", exact: true }] },
  {
    label: "Catalog",
    items: [
      { href: "/admin/brands", label: "Brands", icon: "tag" },
      { href: "/admin/products", label: "Products", icon: "package" },
      { href: "/admin/collections", label: "Collections", icon: "layers" },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/admin/homepage", label: "Homepage", icon: "layout" },
      { href: "/admin/social", label: "Social", icon: "share" },
      { href: "/admin/fit-wars", label: "Fit Wars", icon: "trophy" },
    ],
  },
  {
    label: "Email",
    items: [
      { href: "/admin/email", label: "Overview", icon: "mail", exact: true },
      { href: "/admin/email/analytics", label: "Email analytics", icon: "chart" },
      { href: "/admin/email/contacts", label: "Customers", icon: "users" },
      { href: "/admin/email/campaigns", label: "Campaigns", icon: "send" },
      { href: "/admin/email/segments", label: "Segments", icon: "layers" },
      { href: "/admin/email/templates", label: "Templates", icon: "layout" },
      { href: "/admin/email/popup", label: "Signup popup", icon: "layout", also: ["/admin/email-popup"] },
      { href: "/admin/reports", label: "Brand outreach", icon: "arrow" },
      { href: "/admin/email/settings", label: "Email settings", icon: "settings" },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/admin/analytics", label: "Analytics", icon: "chart", also: ["/admin/analytics/growth", "/admin/analytics/brands", "/admin/analytics/glossary"], exact: true },
      { href: "/admin/analytics/comparison", label: "Compare", icon: "compare" },
      { href: "/admin/analytics/alerts", label: "Alerts", icon: "bell" },
    ],
  },
  {
    label: "Store",
    items: [
      { href: "/admin/settings", label: "Settings", icon: "settings", permission: "settings.write" },
      { href: "/admin/team", label: "Team", icon: "users", permission: "team.manage" },
      { href: "/admin/activity", label: "Activity", icon: "clock", permission: "audit.view" },
    ],
  },
];

export function isNavActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) return true;
  if (item.also?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return true;
  if (item.exact) return false;
  return pathname.startsWith(`${item.href}/`);
}

/** Pages offered by the command palette (Ctrl+K), beyond the sidebar items. */
export const PALETTE_PAGES: Array<{ href: string; label: string; hint: string }> = [
  ...NAV_GROUPS.flatMap((group) => group.items.map((item) => ({ href: item.href, label: item.label, hint: group.label ?? "Page" }))),
  { href: "/admin/brands/new", label: "Add a new brand", hint: "Action" },
  { href: "/admin/products?status=needs_review", label: "Review products that need review", hint: "Action" },
  { href: "/admin/analytics/growth", label: "Analytics: growth", hint: "Insights" },
  { href: "/admin/social/tiktok", label: "Social: TikTok", hint: "Marketing" },
  { href: "/admin/social/instagram", label: "Social: Instagram", hint: "Marketing" },
  { href: "/admin/social/pinterest", label: "Social: Pinterest", hint: "Marketing" },
];
