import { timingSafeEqual } from "node:crypto";

/**
 * Bearer-secret check shared by the /api/cron/* routes.
 *
 * - Secret configured: the Authorization header must be exactly `Bearer <secret>` (constant-time compare).
 * - Secret NOT configured: allowed only outside production, so local development keeps working
 *   but a production deploy that lost its CRON_SECRET stops accepting anonymous calls instead of
 *   silently opening every cron endpoint to the internet.
 */
export function hasCronSecretAccess(authorizationHeader: string | null, env: { CRON_SECRET?: string; NODE_ENV?: string } = process.env): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return env.NODE_ENV !== "production";
  if (!authorizationHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authorizationHeader);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
