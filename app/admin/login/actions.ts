"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE_NAME, createAdminSessionToken, isAdminConfigured, verifyAdminPassword,
  checkLoginRateLimit, recordLoginFailure, clearLoginAttempts,
} from "@/lib/admin-auth";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, createSessionToken, sessionSigningSecret } from "@/lib/admin-session-token";
import { accountsStatus, createSession, findUserByEmail, normalizeEmail, revokeSession, updateUser } from "@/lib/admin-users";
import { hashPassword, verifyPassword } from "@/lib/admin-passwords";
import { verifyTotp } from "@/lib/admin-totp";
import { requiresTwoFactor } from "@/lib/admin-permissions";
import { getPrincipal, actorOf } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/audit";
import { safeAdminPath } from "@/lib/safe-redirect";

async function clientIp(): Promise<string> {
  const requestHeaders = await headers();
  // Never trust the left-most x-forwarded-for entry: it is whatever the client
  // sent. Prefer the CDN's header, then the right-most entry (the one our own
  // reverse proxy appended). The global lockout bucket in admin-auth.ts covers
  // anything spoofed past this.
  const cdnIp = requestHeaders.get("cf-connecting-ip")?.trim();
  if (cdnIp) return cdnIp;
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",").map((part) => part.trim()).filter(Boolean).pop() || "unknown";
  return requestHeaders.get("x-real-ip") ?? "unknown";
}

const COOKIE_BASE = { httpOnly: true, secure: true, sameSite: "lax", path: "/" } as const;
const LOGIN_HINT_COOKIE = "adm_login_hint";

// Verified against when an email is unknown, so "no such account" and "wrong password" take the same time.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword("street-dummy-password-for-timing"));

/** Sends the person back to the sign-in form with an error. The email they typed is kept in a short-lived cookie, never in the URL. */
async function back(error: string, next: string, options: { retry?: string; email?: string } = {}): Promise<never> {
  if (options.email) (await cookies()).set(LOGIN_HINT_COOKIE, options.email, { ...COOKIE_BASE, path: "/admin/login", maxAge: 300 });
  const params = new URLSearchParams({ error, next });
  if (options.retry) params.set("retry", options.retry);
  redirect(`/admin/login?${params.toString()}`);
}

export async function login(formData: FormData) {
  const next = safeAdminPath(formData.get("next"));
  const ip = await clientIp();
  const status = await accountsStatus().catch(() => ({ available: false, hasUsers: false }));
  const accountsMode = status.available && status.hasUsers;
  const wantsLegacy = formData.get("mode") === "legacy";

  // ---- Shared password (legacy mode, or break-glass when explicitly allowed) ----
  if (!accountsMode || (wantsLegacy && process.env.ADMIN_ALLOW_LEGACY_LOGIN === "true")) {
    if (!isAdminConfigured()) redirect("/admin/login?error=not-configured");
    const rateLimit = await checkLoginRateLimit(ip);
    if (rateLimit.locked) return back("locked", next, { retry: String(rateLimit.retryAfterMinutes ?? 15) });
    if (!(await verifyAdminPassword(String(formData.get("password") ?? "")))) {
      await recordLoginFailure(ip);
      await recordAudit({ id: null, label: "shared password" }, { action: "auth.login_failed", summary: "Failed shared-password sign-in", details: { ip } });
      return back("invalid", next);
    }
    await clearLoginAttempts(ip);
    const token = await createAdminSessionToken();
    (await cookies()).set(ADMIN_COOKIE_NAME, token as string, { ...COOKIE_BASE, maxAge: 60 * 60 * 24 * 30 });
    await recordAudit({ id: null, label: "shared password" }, { action: "auth.login", summary: "Signed in with the shared password", details: { ip } });
    redirect(next);
  }

  // ---- Personal account ----
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "");
  const emailKey = `email:${email}`;

  const [ipLimit, emailLimit] = await Promise.all([checkLoginRateLimit(ip), email ? checkLoginRateLimit(emailKey) : Promise.resolve({ locked: false } as { locked: boolean; retryAfterMinutes?: number })]);
  const locked = ipLimit.locked ? ipLimit : emailLimit.locked ? emailLimit : null;
  if (locked) return back("locked", next, { retry: String(locked.retryAfterMinutes ?? 15), email });

  const user = email ? await findUserByEmail(email).catch(() => null) : null;
  const passwordOk = await verifyPassword(password, user?.password_hash ?? (await getDummyHash()));
  if (!user || !user.is_active || !passwordOk) {
    await Promise.all([recordLoginFailure(ip), email ? recordLoginFailure(emailKey, false) : Promise.resolve()]);
    await recordAudit({ id: null, label: email || "unknown" }, { action: "auth.login_failed", summary: `Failed sign-in for ${email || "an unknown account"}`, details: { ip } });
    return back("invalid", next, { email });
  }

  if (user.totp_enabled && user.totp_secret) {
    if (!code.trim()) return back("code-needed", next, { email });
    const step = verifyTotp(user.totp_secret, code, Date.now(), user.totp_last_step);
    if (step === null) {
      await Promise.all([recordLoginFailure(ip), recordLoginFailure(emailKey, false)]);
      await recordAudit({ id: user.id, label: user.email }, { action: "auth.login_failed", summary: "Wrong two-step code", details: { ip } });
      return back("bad-code", next, { email });
    }
    await updateUser(user.id, { totp_last_step: step });
  }

  await Promise.all([clearLoginAttempts(ip), clearLoginAttempts(emailKey)]);

  const secret = sessionSigningSecret();
  if (!secret) redirect("/admin/login?error=not-configured");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const userAgent = (await headers()).get("user-agent");
  const session = await createSession({ userId: user.id, expiresAt, ip, userAgent });
  const token = await createSessionToken(session.id, Math.floor(expiresAt.getTime() / 1000), secret);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, { ...COOKIE_BASE, maxAge: SESSION_MAX_AGE_SECONDS });
  store.delete(ADMIN_COOKIE_NAME);
  await updateUser(user.id, { last_login_at: new Date().toISOString() });
  await recordAudit({ id: user.id, label: user.email }, { action: "auth.login", summary: "Signed in", details: { ip, twoStep: user.totp_enabled } });

  const needsAccountPage = user.must_change_password || (requiresTwoFactor(user.role) && !user.totp_enabled);
  redirect(needsAccountPage ? "/admin/account" : next);
}

export async function logout() {
  const principal = await getPrincipal();
  if (principal) {
    if (principal.sessionId) await revokeSession(principal.sessionId).catch(() => undefined);
    await recordAudit(actorOf(principal), { action: "auth.logout", summary: "Signed out" });
  }
  const store = await cookies();
  store.delete(ADMIN_COOKIE_NAME);
  store.delete(SESSION_COOKIE_NAME);
  redirect("/admin/login");
}
