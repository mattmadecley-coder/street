// Minimal password-gate for /admin. There's exactly one admin (the site
// owner), so this deliberately skips a full auth system: one shared
// password (ADMIN_PASSWORD env var) plus a signed session cookie so the
// password itself is never stored client-side after login.
//
// IMPORTANT: set ADMIN_PASSWORD in the Vercel project's environment
// variables (Settings -> Environment Variables) and redeploy. Until that's
// set, /admin/login will refuse every attempt.

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
