// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test from "node:test";
import assert from "node:assert/strict";
import { hasCronSecretAccess } from "../lib/cron-auth.ts";

test("with a secret set, only the exact bearer token is accepted", () => {
  const env = { CRON_SECRET: "s3cret", NODE_ENV: "production" };
  assert.equal(hasCronSecretAccess("Bearer s3cret", env), true);
  assert.equal(hasCronSecretAccess("Bearer s3cre", env), false);
  assert.equal(hasCronSecretAccess("Bearer s3cret ", env), false);
  assert.equal(hasCronSecretAccess("bearer s3cret", env), false);
  assert.equal(hasCronSecretAccess("s3cret", env), false);
  assert.equal(hasCronSecretAccess("", env), false);
  assert.equal(hasCronSecretAccess(null, env), false);
});

test("production without a secret rejects everyone instead of opening the endpoint", () => {
  assert.equal(hasCronSecretAccess(null, { NODE_ENV: "production" }), false);
  assert.equal(hasCronSecretAccess("Bearer anything", { NODE_ENV: "production" }), false);
  assert.equal(hasCronSecretAccess(null, { CRON_SECRET: "", NODE_ENV: "production" }), false);
});

test("local development without a secret stays open so cron routes can be tried by hand", () => {
  assert.equal(hasCronSecretAccess(null, { NODE_ENV: "development" }), true);
  assert.equal(hasCronSecretAccess(null, {}), true);
});
