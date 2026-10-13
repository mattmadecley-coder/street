/**
 * Only lets a user-supplied redirect target stay inside /admin. Anything else
 * (absolute URLs, protocol-relative `//host`, backslashes, control characters,
 * `..` segments, including percent-encoded variants) falls back, so a forged
 * form field can't turn an admin action into an open redirect.
 */
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;

export function safeAdminPath(value: unknown, fallback = "/admin"): string {
  const text = String(value ?? "").trim();
  if (!/^\/admin(\/|\?|#|$)/.test(text)) return fallback;
  if (text.startsWith("//") || CONTROL_OR_BACKSLASH.test(text)) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    return fallback;
  }
  if (CONTROL_OR_BACKSLASH.test(decoded)) return fallback;
  if (decoded.split(/[?#]/)[0].split("/").includes("..")) return fallback;
  return text;
}
