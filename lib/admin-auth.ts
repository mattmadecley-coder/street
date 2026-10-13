// Minimal password-gate for /admin. There's exactly one admin (the site
// owner), so this deliberately skips a full auth system: one shared
// password (ADMIN_PASSWORD env var) plus a signed session cookie so the
// password itself is never stored client-side after login.
//
// IMPORTANT: set ADMIN_PASSWORD in the app's environment variables (the
// hosting dashboard) and redeploy. Until that's set, /admin/login will refuse
// every attempt.

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

/** Compares a submitted password against ADMIN_PASSWORD without leaking its length or content via timing: both sides are HMAC'd to equal-length digests first. */
export async function verifyAdminPassword(input: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const [a, b] = await Promise.all([hmacHex("street-admin-password-compare", input), hmacHex("street-admin-password-compare", expected)]);
  return timingSafeEqual(a, b);
}

// Brute-force protection: since there's one shared password and no
// per-user accounts, failed attempts are tracked per client IP in
// admin_login_attempts instead, plus one global bucket so an attacker who
// rotates (or spoofs) IPs still hits a ceiling. Counts decay: a bucket whose
// last failure is older than the lockout window starts over. Fails open
// (never blocks a login) if Supabase isn't reachable -- a monitoring hiccup
// should never lock the real admin out of their own site.
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const MAX_FAILED_LOGIN_ATTEMPTS_GLOBAL = 30;
const LOGIN_LOCKOUT_MINUTES = 15;
const GLOBAL_BUCKET = "__global__";

type AttemptRow = { fail_count: number; locked_until: string | null; updated_at: string | null };

async function readBucket(key: string): Promise<AttemptRow | undefined> {
  const rows = await supabaseRest<AttemptRow[]>(
    `admin_login_attempts?select=fail_count,locked_until,updated_at&ip=eq.${encodeURIComponent(key)}&limit=1`,
    { noStore: true },
  );
  return rows[0];
}

function lockRemainingMinutes(row: AttemptRow | undefined): number {
  const lockedUntil = row?.locked_until ? new Date(row.locked_until).getTime() : 0;
  return lockedUntil > Date.now() ? Math.ceil((lockedUntil - Date.now()) / 60_000) : 0;
}

export async function checkLoginRateLimit(ip: string): Promise<{ locked: boolean; retryAfterMinutes?: number }> {
  if (!hasSupabaseCatalog()) return { locked: false };
  try {
    const [own, global] = await Promise.all([readBucket(ip), readBucket(GLOBAL_BUCKET)]);
    const retryAfterMinutes = Math.max(lockRemainingMinutes(own), lockRemainingMinutes(global));
    return retryAfterMinutes > 0 ? { locked: true, retryAfterMinutes } : { locked: false };
  } catch {
    return { locked: false };
  }
}

async function bumpBucket(key: string, max: number): Promise<void> {
  const row = await readBucket(key);
  const stale = !row?.updated_at || Date.now() - new Date(row.updated_at).getTime() > LOGIN_LOCKOUT_MINUTES * 60_000;
  const nextCount = (stale ? 0 : row?.fail_count ?? 0) + 1;
  const lockedUntil = nextCount >= max ? new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60_000).toISOString() : null;
  await supabaseRest("admin_login_attempts?on_conflict=ip", {
    method: "POST",
    body: { ip: key, fail_count: nextCount, locked_until: lockedUntil, updated_at: new Date().toISOString() },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

/** Counts a failed sign-in against `key` (an IP, or `email:<address>`), and against the global bucket unless `includeGlobal` is false. */
export async function recordLoginFailure(key: string, includeGlobal = true): Promise<void> {
  if (!hasSupabaseCatalog()) return;
  try {
    await Promise.all([bumpBucket(key, MAX_FAILED_LOGIN_ATTEMPTS), ...(includeGlobal ? [bumpBucket(GLOBAL_BUCKET, MAX_FAILED_LOGIN_ATTEMPTS_GLOBAL)] : [])]);
  } catch {
    // best-effort -- a logging failure shouldn't block the login flow either way
  }
}

export async function clearLoginAttempts(ip: string): Promise<void> {
  if (!hasSupabaseCatalog()) return;
  await supabaseRest(`admin_login_attempts?ip=eq.${encodeURIComponent(ip)}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => undefined);
}
