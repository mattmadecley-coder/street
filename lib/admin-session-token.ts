/**
 * Signed session cookie for account logins. Uses Web Crypto only, so the same
 * code runs in the request proxy (cheap first gate) and in server code.
 *
 *   v2.<sessionId>.<expiresAtEpochSeconds>.<signature>
 *
 * The signature proves the server issued the cookie and stops anyone editing the
 * expiry. Whether the session is still *valid* (not revoked, user still active) is
 * decided by the database row, which the server checks on every page and action.
 */
export const SESSION_COOKIE_NAME = "street_admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

/** The secret used to sign session cookies. Prefers a dedicated one; otherwise derives from existing server secrets. */
export function sessionSigningSecret(env: Record<string, string | undefined> = process.env): string | null {
  return env.ADMIN_SESSION_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || env.ADMIN_PASSWORD || null;
}

export async function createSessionToken(sessionId: string, expiresAtSeconds: number, secret: string): Promise<string> {
  const body = `v2.${sessionId}.${expiresAtSeconds}`;
  return `${body}.${await sign(secret, body)}`;
}

export type VerifiedToken = { sessionId: string; expiresAtSeconds: number };

/** Returns the session id when the cookie is correctly signed and not expired; otherwise null. */
export async function verifySessionToken(token: string | null | undefined, secret: string | null, nowSeconds: number = Math.floor(Date.now() / 1000)): Promise<VerifiedToken | null> {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v2") return null;
  const [, sessionId, expiresText, signature] = parts;
  if (!/^[0-9a-f-]{36}$/.test(sessionId)) return null;
  const expiresAtSeconds = Number(expiresText);
  if (!Number.isInteger(expiresAtSeconds) || expiresAtSeconds <= nowSeconds) return null;
  const expected = await sign(secret, `v2.${sessionId}.${expiresAtSeconds}`);
  return equal(signature, expected) ? { sessionId, expiresAtSeconds } : null;
}
