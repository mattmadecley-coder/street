import { randomBytes } from "node:crypto";

/**
 * Hands a secret (such as a new account's temporary password) from a Server Action to the
 * next page view exactly once, without putting the secret in a URL or a cookie. The redirect
 * carries only an unguessable id; the page exchanges it for the secret, and it is then gone.
 * Held in server memory for a couple of minutes, so it does not survive a restart (the admin
 * would simply reset the password again).
 */
const store = new Map<string, { value: string; expiresAt: number }>();
const TTL_MS = 2 * 60_000;

function sweep(now: number) {
  for (const [id, entry] of store) if (entry.expiresAt <= now) store.delete(id);
}

export function stashOneTimeSecret(value: string, now: number = Date.now()): string {
  sweep(now);
  const id = randomBytes(18).toString("base64url");
  store.set(id, { value, expiresAt: now + TTL_MS });
  return id;
}

/** Returns the secret the first time, then null. */
export function takeOneTimeSecret(id: string | null | undefined, now: number = Date.now()): string | null {
  if (!id) return null;
  const entry = store.get(id);
  store.delete(id);
  return entry && entry.expiresAt > now ? entry.value : null;
}
