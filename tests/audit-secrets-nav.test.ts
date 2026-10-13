// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeDetails } from "../lib/audit.ts";
import { stashOneTimeSecret, takeOneTimeSecret } from "../lib/one-time-secrets.ts";
import { NAV_GROUPS } from "../components/admin/nav-config.ts";
import { can, ROLES } from "../lib/admin-permissions.ts";

test("audit details: secrets are removed and long text is trimmed", () => {
  const clean = sanitizeDetails({
    title: "ok",
    password: "hunter2",
    new_password: "x",
    apiKey: "sk-123",
    nested: { totp_secret: "ABC", fine: 1, Authorization: "Bearer x" },
    list: ["a", { token: "t", keep: true }],
    long: "x".repeat(900),
  });
  assert.equal(clean.title, "ok");
  assert.equal(clean.password, "[removed]");
  assert.equal(clean.new_password, "[removed]");
  assert.equal(clean.apiKey, "[removed]");
  assert.equal(clean.nested.totp_secret, "[removed]");
  assert.equal(clean.nested.Authorization, "[removed]");
  assert.equal(clean.nested.fine, 1);
  assert.deepEqual(clean.list, ["a", { token: "[removed]", keep: true }]);
  assert.ok(clean.long.length <= 501);
});

test("audit details: cycles of nesting are cut off, odd values do not throw", () => {
  const deep = { a: { b: { c: { d: { e: 1 } } } } };
  assert.equal(JSON.stringify(sanitizeDetails(deep)).includes("[nested]"), true);
  assert.equal(sanitizeDetails(null), null);
  assert.equal(sanitizeDetails(undefined), undefined);
  assert.equal(sanitizeDetails(12), 12);
  assert.equal(typeof sanitizeDetails(Symbol("x")), "string");
});

test("one-time secrets can be read exactly once and expire", () => {
  const now = 1_000_000;
  const id = stashOneTimeSecret("temp-pass", now);
  assert.equal(takeOneTimeSecret(id, now + 1000), "temp-pass");
  assert.equal(takeOneTimeSecret(id, now + 2000), null, "second read is empty");
  const late = stashOneTimeSecret("temp-pass-2", now);
  assert.equal(takeOneTimeSecret(late, now + 3 * 60_000), null, "expired after two minutes");
  assert.equal(takeOneTimeSecret("not-an-id", now), null);
  assert.equal(takeOneTimeSecret(null, now), null);
  assert.notEqual(stashOneTimeSecret("a", now), stashOneTimeSecret("a", now), "ids are unguessable and unique");
});

test("sidebar: team, settings and activity are limited to roles that may use them", () => {
  const items = NAV_GROUPS.flatMap((group) => group.items);
  const visibleTo = (role) => items.filter((item) => !item.permission || can(role, item.permission)).map((item) => item.label);
  assert.ok(visibleTo("owner").includes("Team"));
  assert.ok(visibleTo("owner").includes("Activity"));
  assert.ok(visibleTo("admin").includes("Activity"));
  assert.ok(!visibleTo("admin").includes("Team"), "only owners manage the team");
  for (const role of ["editor", "marketing", "analyst"]) {
    for (const label of ["Team", "Settings", "Activity"]) assert.ok(!visibleTo(role).includes(label), `${role} should not see ${label}`);
  }
  for (const role of ROLES) assert.ok(visibleTo(role).includes("Home"));
});
