// @ts-nocheck -- run with `npm test`. Talks to the in-memory stand-in for the database (tests/fakes/supabase-rest.ts).
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as db from "./fakes/supabase-rest.ts";
import {
  accountsStatus, resetAccountsStatusCache, createUser, findUserByEmail, findUserById, updateUser, listUsers,
  createSession, findSession, revokeSession, revokeUserSessions, listActiveSessions, normalizeEmail, looksLikeEmail,
} from "../lib/admin-users.ts";
import { recordAudit } from "../lib/audit.ts";
import { readAdminState, writeAdminState, AdminStateUnavailableError } from "../lib/admin-state.ts";
import { checkLoginRateLimit, recordLoginFailure, clearLoginAttempts } from "../lib/admin-auth.ts";
import { trashSupported, resetTrashSupportCache } from "../lib/trash.ts";

function setup(...tables) {
  db.__reset();
  for (const name of tables) db.__table(name);
  resetAccountsStatusCache();
  resetTrashSupportCache();
}
beforeEach(() => setup());

const owner = { email: "Owner@Example.com ", name: "Owner", role: "owner", passwordHash: "scrypt$x", mustChangePassword: false, createdBy: null };

test("accounts mode is off until the tables exist AND an active owner exists", async () => {
  setup();
  assert.deepEqual(await accountsStatus(), { available: false, hasUsers: false }, "missing table = not available");
  setup("admin_users");
  assert.deepEqual(await accountsStatus(), { available: true, hasUsers: false });
  const user = await createUser(owner);
  assert.deepEqual(await accountsStatus(), { available: true, hasUsers: true });
  await updateUser(user.id, { is_active: false });
  assert.deepEqual(await accountsStatus(), { available: true, hasUsers: false }, "a deactivated owner does not count");
});

test("an editor alone does not switch the system into accounts mode", async () => {
  setup("admin_users");
  await createUser({ ...owner, email: "ed@example.com", role: "editor" });
  assert.equal((await accountsStatus()).hasUsers, false);
});

test("users: emails are normalised, unique, and found case-insensitively", async () => {
  setup("admin_users");
  const user = await createUser(owner);
  assert.equal(user.email, "owner@example.com");
  assert.equal((await findUserByEmail("OWNER@example.com")).id, user.id);
  assert.equal(await findUserByEmail("nobody@example.com"), null);
  await assert.rejects(() => createUser({ ...owner, email: "owner@example.com" }), /duplicate key/);
  assert.equal(normalizeEmail("  A@B.Co "), "a@b.co");
  assert.equal(looksLikeEmail("a@b.co"), true);
  assert.equal(looksLikeEmail("a b@c.d"), false);
  assert.equal(looksLikeEmail("nope"), false);
});

test("users: lookups reject malformed ids instead of building a bad query", async () => {
  setup("admin_users");
  assert.equal(await findUserById("not-a-uuid"), null);
  assert.equal(await findUserById("1 or 1=1"), null);
  await assert.rejects(() => updateUser("../etc", { name: "x" }), /Invalid user id/);
});

test("users: update changes only the given fields and listing is oldest first", async () => {
  setup("admin_users");
  const a = await createUser(owner);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const b = await createUser({ ...owner, email: "b@example.com", role: "analyst" });
  await updateUser(b.id, { role: "editor", must_change_password: true });
  const found = await findUserById(b.id);
  assert.equal(found.role, "editor");
  assert.equal(found.must_change_password, true);
  assert.equal(found.email, "b@example.com");
  assert.deepEqual((await listUsers()).map((u) => u.id), [a.id, b.id]);
});

test("sessions: revoke one, revoke all but the current, and expired sessions are not listed", async () => {
  setup("admin_users", "admin_sessions");
  const user = await createUser(owner);
  const future = new Date(Date.now() + 86_400_000);
  const s1 = await createSession({ userId: user.id, expiresAt: future, ip: "1.1.1.1", userAgent: "Chrome" });
  const s2 = await createSession({ userId: user.id, expiresAt: future, ip: "2.2.2.2", userAgent: "Firefox" });
  const s3 = await createSession({ userId: user.id, expiresAt: future, ip: "3.3.3.3", userAgent: "Safari" });
  await createSession({ userId: user.id, expiresAt: new Date(Date.now() - 1000), ip: null, userAgent: null });
  assert.equal((await listActiveSessions(user.id)).length, 3, "expired session is excluded");

  await revokeSession(s1.id);
  assert.ok((await findSession(s1.id)).revoked_at);
  assert.equal((await listActiveSessions(user.id)).length, 2);

  await revokeUserSessions(user.id, s2.id);
  const remaining = await listActiveSessions(user.id);
  assert.deepEqual(remaining.map((s) => s.id), [s2.id], "only the session we kept is still active");
  assert.equal((await findSession(s3.id)).revoked_at !== null, true);

  await revokeUserSessions(user.id);
  assert.equal((await listActiveSessions(user.id)).length, 0);
  assert.equal(await findSession("zzz"), null);
});

test("sessions only belong to the user they were created for", async () => {
  setup("admin_users", "admin_sessions");
  const a = await createUser(owner);
  const b = await createUser({ ...owner, email: "b@example.com", role: "editor" });
  const future = new Date(Date.now() + 86_400_000);
  await createSession({ userId: a.id, expiresAt: future, ip: null, userAgent: null });
  const sb = await createSession({ userId: b.id, expiresAt: future, ip: null, userAgent: null });
  await revokeUserSessions(a.id);
  assert.equal((await findSession(sb.id)).revoked_at, null, "revoking A must not touch B");
});

test("audit log: entries are stored with secrets removed; a missing table never breaks the action", async () => {
  setup("audit_log");
  await recordAudit({ id: null, label: "me@example.com" }, { action: "team.user_created", summary: "Created editor", details: { email: "x@example.com", password: "hunter2" } });
  const [row] = db.__rows("audit_log");
  assert.equal(row.actor_label, "me@example.com");
  assert.equal(row.action, "team.user_created");
  assert.equal(row.details.password, "[removed]");
  assert.equal(row.details.email, "x@example.com");

  db.__drop("audit_log");
  await assert.doesNotReject(() => recordAudit({ id: null, label: "me" }, { action: "x", summary: "y" }));
});

test("admin state: reads fall back and report unavailable when the table is missing; writes refuse", async () => {
  setup();
  assert.deepEqual(await readAdminState("alert_thresholds", { a: 1 }), { value: { a: 1 }, available: false });
  await assert.rejects(() => writeAdminState("alert_thresholds", {}), AdminStateUnavailableError);
  setup("admin_state");
  assert.deepEqual(await readAdminState("alert_thresholds", { a: 1 }), { value: { a: 1 }, available: true });
  await writeAdminState("alert_thresholds", { silenceHours: 12 });
  await writeAdminState("alert_thresholds", { silenceHours: 24 });
  assert.deepEqual((await readAdminState("alert_thresholds", {})).value, { silenceHours: 24 });
  assert.equal(db.__rows("admin_state").length, 1, "second write updates, not duplicates");
});

test("login lockout: 5 failures lock an IP for 15 minutes, other IPs are unaffected, success clears it", async () => {
  setup("admin_login_attempts");
  for (let i = 0; i < 4; i += 1) await recordLoginFailure("9.9.9.9");
  assert.equal((await checkLoginRateLimit("9.9.9.9")).locked, false, "4 failures: not locked yet");
  await recordLoginFailure("9.9.9.9");
  const locked = await checkLoginRateLimit("9.9.9.9");
  assert.equal(locked.locked, true);
  assert.ok(locked.retryAfterMinutes >= 14 && locked.retryAfterMinutes <= 15);
  assert.equal((await checkLoginRateLimit("8.8.8.8")).locked, false);
  await clearLoginAttempts("9.9.9.9");
  assert.equal((await checkLoginRateLimit("9.9.9.9")).locked, false);
});

test("login lockout: counts start over once the window has passed, and email buckets do not feed the global bucket", async () => {
  setup("admin_login_attempts");
  db.__table("admin_login_attempts", [{ ip: "7.7.7.7", fail_count: 4, locked_until: null, updated_at: new Date(Date.now() - 16 * 60_000).toISOString() }]);
  await recordLoginFailure("7.7.7.7");
  assert.equal(db.__rows("admin_login_attempts").find((r) => r.ip === "7.7.7.7").fail_count, 1, "stale bucket restarts at 1");

  setup("admin_login_attempts");
  for (let i = 0; i < 5; i += 1) await recordLoginFailure("email:a@example.com", false);
  assert.equal((await checkLoginRateLimit("email:a@example.com")).locked, true);
  assert.equal(db.__rows("admin_login_attempts").some((r) => r.ip === "__global__"), false, "no global bucket entry was written");
});

test("login lockout: a spread of different IPs still hits the global ceiling", async () => {
  setup("admin_login_attempts");
  for (let i = 0; i < 30; i += 1) await recordLoginFailure(`10.0.0.${i}`);
  assert.equal((await checkLoginRateLimit("10.0.0.200")).locked, true, "a brand-new IP is locked out by the global bucket");
});

test("trash support is detected from the products.deleted_at column", async () => {
  setup();
  db.__table("products", []);
  // The stand-in does not model columns, so simulate "column missing" by making the table absent.
  db.__drop("products");
  assert.equal(await trashSupported().catch(() => false), false);
  resetTrashSupportCache();
  db.__table("products", []);
  assert.equal(await trashSupported(), true);
});
