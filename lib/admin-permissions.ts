/**
 * Who can do what in the admin. One table, checked both when a page is shown
 * (to hide buttons) and again inside every Server Action (the real gate).
 */
export const ROLES = ["owner", "admin", "editor", "marketing", "analyst"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, { label: string; description: string }> = {
  owner: { label: "Owner", description: "Everything, including managing the team and permanently deleting data." },
  admin: { label: "Admin", description: "Everything except managing the team and permanent deletion." },
  editor: { label: "Catalog editor", description: "Brands, products and collections. Cannot delete or send emails." },
  marketing: { label: "Marketing", description: "Homepage, brand report drafts, social and chart notes. Cannot change the catalog." },
  analyst: { label: "Analyst", description: "Read-only access to everything except settings, team and activity." },
};

export const PERMISSIONS = [
  "view",
  "catalog.write",
  "catalog.delete",
  "catalog.purge",
  "homepage.write",
  "reports.manage",
  "reports.send",
  "analytics.write",
  "settings.write",
  "team.manage",
  "audit.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(PERMISSIONS),
  admin: new Set<Permission>(["view", "catalog.write", "catalog.delete", "homepage.write", "reports.manage", "reports.send", "analytics.write", "settings.write", "audit.view"]),
  editor: new Set<Permission>(["view", "catalog.write", "analytics.write"]),
  marketing: new Set<Permission>(["view", "homepage.write", "reports.manage", "analytics.write"]),
  analyst: new Set<Permission>(["view"]),
};

export function can(role: Role | undefined, permission: Permission): boolean {
  return Boolean(role && MATRIX[role]?.has(permission));
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Roles that must use two-step sign-in: anyone who can change the team, settings or send email. */
export function requiresTwoFactor(role: Role): boolean {
  return role === "owner" || role === "admin";
}
