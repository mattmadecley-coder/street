// Minimal password-gate for /admin. There's exactly one admin (the site
// owner), so this deliberately skips a full auth system: one shared
// password (ADMIN_PASSWORD env var) plus a signed session cookie so the
// password itself is never stored client-side after login.
//
// IMPORTANT: set ADMIN_PASSWORD in the Vercel project's environment
// variables (Settings -> Environment Variables) and redeploy. Until that's
// set, /admin/login will refuse every attempt.

import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";

export const ADMIN_COOKIE_NAME = "street_admin";
const SESSION_MESSAGE = "street-admin-session-v1";

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The session token a valid login should produce. Deterministic per ADMIN_PASSWORD, so no server-side session storage is needed. */
export async function createAdminSessionToken(): Promise<string | null> {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return null;
  return hmacHex(secret, SESSION_MESSAGE);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

export async function isValidAdminSession(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const expected = await createAdminSessionToken();
  if (!expected) return false;
  return timingSafeEqual(token, expected);
}

export function isAdminConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD);
}

// Brute-force protection: since there's one shared password and no
// per-user accounts, failed attempts are tracked per client IP in
// admin_login_attempts instead. Fails open (never blocks a login) if
// Supabase isn't reachable — a monitoring hiccup should never lock the
// real admin out of their own site.
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MINUTES = 15;

export async function checkLoginRateLimit(ip: string): Promise<{ locked: boolean; retryAfterMinutes?: number }> {
  if (!hasSupabaseCatalog()) return { locked: false };
  try {
    const rows = await supabaseRest<Array<{ locked_until: string | null }>>(
      `admin_login_attempts?select=locked_until&ip=eq.${encodeURIComponent(ip)}&limit=1`,
      { noStore: true },
    );
    const lockedUntil = rows[0]?.locked_until;
    if (lockedUntil && new Date(lockedUntil).getTime() > Date.now()) {
      return { locked: true, retryAfterMinutes: Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60_000) };
    }
    return { locked: false };
  } catch {
    return { locked: false };
  }
}

export async function recordLoginFailure(ip: string): Promise<void> {
  if (!hasSupabaseCatalog()) return;
  try {
    const rows = await supabaseRest<Array<{ fail_count: number }>>(
      `admin_login_attempts?select=fail_count&ip=eq.${encodeURIComponent(ip)}&limit=1`,
      { noStore: true },
    );
    const nextCount = (rows[0]?.fail_count ?? 0) + 1;
    const lockedUntil = nextCount >= MAX_FAILED_LOGIN_ATTEMPTS ? new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60_000).toISOString() : null;
    await supabaseRest("admin_login_attempts?on_conflict=ip", {
      method: "POST",
      body: { ip, fail_count: nextCount, locked_until: lockedUntil, updated_at: new Date().toISOString() },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  } catch {
    // best-effort — a logging failure shouldn't block the login flow either way
  }
}

export async function clearLoginAttempts(ip: string): Promise<void> {
  if (!hasSupabaseCatalog()) return;
  await supabaseRest(`admin_login_attempts?ip=eq.${encodeURIComponent(ip)}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => undefined);
}
