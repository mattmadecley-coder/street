import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

/**
 * Password hashing for admin accounts: scrypt with a random salt (built into Node, no dependency).
 * Stored as `scrypt$N$r$p$salt$hash` so parameters can be raised later without breaking old hashes.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize("NFKC"), salt, KEY_LENGTH, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nText, rText, pText, saltText, hashText] = parts;
  const n = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  if (![n, r, p].every((value) => Number.isInteger(value) && value > 0) || n > 1 << 20) return false;
  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(hashText, "base64url");
    const actual = await derive(password, salt, n, r, p);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

const COMMON = new Set([
  "password1234", "123456789012", "qwertyuiop12", "letmein12345", "administrator", "welcome12345", "streetdotcom1", "iloveyou1234",
]);

/** Returns a human-readable problem with a proposed password, or null when it is acceptable. */
export function passwordProblem(password: string, context: { email?: string; name?: string } = {}): string | null {
  if (password.length < 12) return "Use at least 12 characters.";
  if (password.length > 200) return "That password is too long.";
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "That password is too common.";
  if (/^(.)\1+$/.test(password)) return "Use more than one repeated character.";
  const emailName = (context.email ?? "").split("@")[0].toLowerCase();
  if (emailName.length >= 4 && lower.includes(emailName)) return "Do not include your email name in your password.";
  const first = (context.name ?? "").split(/\s+/)[0]?.toLowerCase() ?? "";
  if (first.length >= 4 && lower.includes(first)) return "Do not include your name in your password.";
  return null;
}

/** A readable one-time password for new accounts and resets (shown once to the admin who creates it). */
export function generateTemporaryPassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(18);
  let out = "";
  for (let index = 0; index < 18; index += 1) out += alphabet[bytes[index] % alphabet.length];
  return `${out.slice(0, 6)}-${out.slice(6, 12)}-${out.slice(12, 18)}`;
}
