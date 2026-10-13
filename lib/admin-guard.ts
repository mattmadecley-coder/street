// Who is signed in, and what they may do.
//
// Defense in depth: proxy.ts already gates every /admin route, but a Server
// Action is a public POST endpoint in its own right, and a soft navigation does
// not re-run the layout. So every page calls requireUser() and every action
// calls requirePermission() -- they check the database session, not just the cookie.
//
// Two modes, chosen automatically:
//  - legacy: no owner account exists yet -> the shared ADMIN_PASSWORD cookie is the identity (full access).
//  - accounts: at least one active owner exists -> only signed account sessions count.
//    ADMIN_ALLOW_LEGACY_LOGIN=true keeps the shared password working as a break-glass option.

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, isValidAdminSession } from "@/lib/admin-auth";
import { SESSION_COOKIE_NAME, sessionSigningSecret, verifySessionToken } from "@/lib/admin-session-token";
import { accountsStatus, findSession, findUserById, touchSession } from "@/lib/admin-users";
import { can, requiresTwoFactor, type Permission, type Role } from "@/lib/admin-permissions";
import type { Actor } from "@/lib/audit";

export type Principal = {
  kind: "user" | "legacy";
  id: string | null;
  email: string;
  name: string;
  role: Role;
  sessionId: string | null;
  mustChangePassword: boolean;
  totpEnabled: boolean;
  /** Owners and admins must enrol two-step sign-in before doing anything else. */
  needsTwoFactorSetup: boolean;
};

export function actorOf(principal: Principal): Actor {
  return { id: principal.id, label: principal.kind === "legacy" ? "shared password" : principal.email };
}

const LEGACY: Principal = {
  kind: "legacy",
  id: null,
  email: "shared-password",
  name: "Shared password",
  role: "owner",
  sessionId: null,
  mustChangePassword: false,
  totpEnabled: false,
  needsTwoFactorSetup: false,
};

const TOUCH_INTERVAL_MS = 5 * 60_000;

/** The signed-in principal for this request, or null. Cached per request. */
export const getPrincipal = cache(async (): Promise<Principal | null> => {
  const store = await cookies();
  let status: { available: boolean; hasUsers: boolean };
  try {
    status = await accountsStatus();
  } catch (error) {
    // Cannot tell which mode we are in (database trouble): fail closed.
    console.error("Street admin accounts status check failed", error);
    return null;
  }

  const legacyCookieValid = await isValidAdminSession(store.get(ADMIN_COOKIE_NAME)?.value);
  const accountsMode = status.available && status.hasUsers;

  if (!accountsMode) return legacyCookieValid ? LEGACY : null;

  const verified = await verifySessionToken(store.get(SESSION_COOKIE_NAME)?.value, sessionSigningSecret());
  if (verified) {
    try {
      const session = await findSession(verified.sessionId);
      if (session && !session.revoked_at && new Date(session.expires_at).getTime() > Date.now()) {
        const user = await findUserById(session.user_id);
        if (user && user.is_active) {
          if (Date.now() - new Date(session.last_seen_at).getTime() > TOUCH_INTERVAL_MS) touchSession(session.id).catch(() => undefined);
          return {
            kind: "user",
            id: user.id,
            email: user.email,
            name: user.name || user.email,
            role: user.role,
            sessionId: session.id,
            mustChangePassword: user.must_change_password,
            totpEnabled: user.totp_enabled,
            needsTwoFactorSetup: requiresTwoFactor(user.role) && !user.totp_enabled,
          };
        }
      }
    } catch (error) {
      console.error("Street admin session lookup failed", error);
      return null;
    }
  }

  // Break-glass: the shared password still works in accounts mode only when explicitly allowed.
  if (legacyCookieValid && process.env.ADMIN_ALLOW_LEGACY_LOGIN === "true") return LEGACY;
  return null;
});

async function currentPath(): Promise<string> {
  return (await headers()).get("x-admin-pathname") ?? "/admin";
}

function loginRedirect(path: string): never {
  redirect(path === "/admin/login" ? "/admin/login" : `/admin/login?next=${encodeURIComponent(path)}`);
}

/**
 * For pages: the signed-in principal, or redirect to sign in. Also sends people who must
 * change a temporary password or enrol two-step sign-in to their account page first.
 */
export async function requireUser(): Promise<Principal> {
  const path = await currentPath();
  const principal = await getPrincipal();
  if (!principal) loginRedirect(path);
  if ((principal.mustChangePassword || principal.needsTwoFactorSetup) && !path.startsWith("/admin/account")) redirect("/admin/account");
  return principal;
}

/** For Server Actions: the principal if they hold `permission`; otherwise redirect to sign in or the "not allowed" page. */
export async function requirePermission(permission: Permission): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal) loginRedirect(await currentPath());
  if (principal.mustChangePassword || principal.needsTwoFactorSetup) redirect("/admin/account");
  if (!can(principal.role, permission)) redirect(`/admin/forbidden?needs=${encodeURIComponent(permission)}`);
  return principal;
}

/** For account self-service actions: any signed-in person, with no password/2FA gating (they are how you clear it). */
export async function requirePrincipal(): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal) loginRedirect(await currentPath());
  return principal;
}

/** Back-compat for callers that only need "someone is signed in". Prefer requirePermission with a specific permission. */
export async function requireAdmin(): Promise<Principal> {
  return requirePermission("view");
}

/** For route handlers that answer 401/403 instead of redirecting. */
export async function hasPermission(permission: Permission): Promise<boolean> {
  const principal = await getPrincipal();
  return Boolean(principal && !principal.mustChangePassword && !principal.needsTwoFactorSetup && can(principal.role, permission));
}

/** @deprecated use hasPermission("view"). */
export async function hasAdminSession(): Promise<boolean> {
  return hasPermission("view");
}
