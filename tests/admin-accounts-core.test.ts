// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, passwordProblem, generateTemporaryPassword } from "../lib/admin-passwords.ts";
import { base32Decode, base32Encode, totpCode, verifyTotp, generateTotpSecret, otpauthUrl } from "../lib/admin-totp.ts";
import { can, isRole, requiresTwoFactor, ROLES, PERMISSIONS } from "../lib/admin-permissions.ts";
import { createSessionToken, verifySessionToken, sessionSigningSecret } from "../lib/admin-session-token.ts";

test("passwords: hash then verify; wrong, empty and malformed hashes fail", async () => {
  const hash = await hashPassword("correct horse battery");
  assert.match(hash, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword("correct horse battery", hash), true);
  assert.equal(await verifyPassword("correct horse batterY", hash), false);
  assert.equal(await verifyPassword("", hash), false);
  assert.equal(await verifyPassword("anything", "not-a-hash"), false);
  assert.equal(await verifyPassword("anything", "scrypt$1$1$1$a$b"), false);
  assert.equal(await verifyPassword("x", "scrypt$99999999999$8$1$AAAA$AAAA"), false, "absurd cost parameters are refused, not computed");
});

test("passwords: same password hashes differently each time (random salt)", async () => {
  const [a, b] = await Promise.all([hashPassword("same password here"), hashPassword("same password here")]);
  assert.notEqual(a, b);
});

test("password policy", () => {
  assert.match(passwordProblem("short"), /12 characters/);
  assert.match(passwordProblem("password1234"), /common/);
  assert.match(passwordProblem("aaaaaaaaaaaaaa"), /repeated/);
  assert.match(passwordProblem("matt-is-great-2026", { email: "matt@example.com" }), /email/);
  assert.match(passwordProblem("hello-Priya-1234", { name: "Priya Shah" }), /name/);
  assert.equal(passwordProblem("a long unrelated passphrase", { email: "matt@example.com", name: "Priya" }), null);
});

test("temporary passwords are long, readable and different each time", () => {
  const a = generateTemporaryPassword();
  assert.match(a, /^[A-Za-z0-9]{6}-[A-Za-z0-9]{6}-[A-Za-z0-9]{6}$/);
  assert.notEqual(a, generateTemporaryPassword());
  assert.equal(passwordProblem(a), null);
});

// RFC 6238 appendix B: secret "12345678901234567890" (SHA-1). The RFC lists 8-digit codes; the last 6 digits are the 6-digit code.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));
test("TOTP matches the RFC 6238 test vectors", () => {
  const vectors = [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"]];
  for (const [seconds, expected] of vectors) assert.equal(totpCode(RFC_SECRET, seconds * 1000), expected, `t=${seconds}`);
});

test("base32 round-trips and rejects junk", () => {
  const data = Buffer.from("Hello, Street!");
  assert.equal(base32Decode(base32Encode(data)).toString(), "Hello, Street!");
  assert.throws(() => base32Decode("not valid 1!"));
  assert.equal(generateTotpSecret().length, 32);
});

test("TOTP verify: accepts the current step and one either side, rejects others and replays", () => {
  const now = 1_700_000_000_000;
  const code = totpCode(RFC_SECRET, now);
  const step = Math.floor(now / 30000);
  assert.equal(verifyTotp(RFC_SECRET, code, now), step);
  assert.equal(verifyTotp(RFC_SECRET, code, now + 30_000), step, "one step later still ok");
  assert.equal(verifyTotp(RFC_SECRET, code, now + 90_000), null, "too old");
  assert.equal(verifyTotp(RFC_SECRET, code, now, step), null, "same step cannot be used twice");
  assert.equal(verifyTotp(RFC_SECRET, "12345", now), null);
  assert.equal(verifyTotp(RFC_SECRET, "abcdef", now), null);
  assert.equal(verifyTotp(RFC_SECRET, ` ${code.slice(0, 3)} ${code.slice(3)} `, now), step, "spaces are ignored");
  assert.equal(verifyTotp("!!!", code, now), null, "corrupt secret fails safely");
});

test("otpauth URL carries the secret and issuer", () => {
  const url = otpauthUrl("ABCDEF", "me@example.com");
  assert.ok(url.startsWith("otpauth://totp/Street%20Admin%3Ame%40example.com?secret=ABCDEF"));
  assert.match(url, /issuer=Street%20Admin/);
});

test("permissions: analyst is read-only, editor cannot delete, only owner manages the team", () => {
  assert.equal(can("analyst", "view"), true);
  for (const permission of PERMISSIONS.filter((item) => item !== "view")) assert.equal(can("analyst", permission), false, `analyst ${permission}`);
  assert.equal(can("editor", "catalog.write"), true);
  assert.equal(can("editor", "catalog.delete"), false);
  assert.equal(can("editor", "reports.send"), false);
  assert.equal(can("marketing", "homepage.write"), true);
  assert.equal(can("marketing", "catalog.write"), false);
  assert.equal(can("admin", "catalog.delete"), true);
  assert.equal(can("admin", "catalog.purge"), false);
  assert.equal(can("admin", "team.manage"), false);
  for (const permission of PERMISSIONS) assert.equal(can("owner", permission), true);
  assert.equal(can(undefined, "view"), false);
  assert.equal(can("hacker", "view"), false);
});

test("two-factor is required exactly for owner and admin; role validation", () => {
  assert.deepEqual(ROLES.filter(requiresTwoFactor), ["owner", "admin"]);
  assert.equal(isRole("owner"), true);
  assert.equal(isRole("root"), false);
  assert.equal(isRole(undefined), false);
});

const SECRET = "test-signing-secret";
const ID = "123e4567-e89b-12d3-a456-426614174000";

test("session token: valid, expired, tampered and wrong-secret cookies", async () => {
  const exp = 2_000_000_000;
  const token = await createSessionToken(ID, exp, SECRET);
  assert.deepEqual(await verifySessionToken(token, SECRET, 1_999_999_000), { sessionId: ID, expiresAtSeconds: exp });
  assert.equal(await verifySessionToken(token, SECRET, exp + 1), null, "expired");
  assert.equal(await verifySessionToken(token, "other-secret", 1_999_999_000), null, "wrong secret");
  const forgedExpiry = token.replace(`.${exp}.`, `.${exp + 999999}.`);
  assert.equal(await verifySessionToken(forgedExpiry, SECRET, 1_999_999_000), null, "edited expiry");
  const otherId = token.replace(ID, "123e4567-e89b-12d3-a456-426614174999");
  assert.equal(await verifySessionToken(otherId, SECRET, 1_999_999_000), null, "edited session id");
  for (const junk of [null, undefined, "", "v2", "v1.a.b.c", "v2.not-a-uuid.2000000000.sig", `${token}.extra`]) {
    assert.equal(await verifySessionToken(junk, SECRET, 1_999_999_000), null, String(junk));
  }
  assert.equal(await verifySessionToken(token, null, 1_999_999_000), null, "no secret configured");
});

test("signing secret prefers the dedicated variable and never returns an empty string", () => {
  assert.equal(sessionSigningSecret({ ADMIN_SESSION_SECRET: "a", SUPABASE_SERVICE_ROLE_KEY: "b", ADMIN_PASSWORD: "c" }), "a");
  assert.equal(sessionSigningSecret({ SUPABASE_SERVICE_ROLE_KEY: "b", ADMIN_PASSWORD: "c" }), "b");
  assert.equal(sessionSigningSecret({ ADMIN_PASSWORD: "c" }), "c");
  assert.equal(sessionSigningSecret({}), null);
  assert.equal(sessionSigningSecret({ ADMIN_SESSION_SECRET: "" }), null);
});
