// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test from "node:test";
import assert from "node:assert/strict";
import { generateTotpSecret, otpauthUrl, totpCode, verifyTotp, base32Decode } from "../lib/admin-totp.ts";
import { qrSvg } from "../lib/admin-qr.ts";

test("setup link carries everything an authenticator app needs", () => {
  const secret = generateTotpSecret();
  const url = new URL(otpauthUrl(secret, "me+admin@example.com"));
  assert.equal(url.protocol, "otpauth:");
  assert.equal(url.host, "totp");
  assert.equal(decodeURIComponent(url.pathname.slice(1)), "Street Admin:me+admin@example.com");
  assert.equal(url.searchParams.get("secret"), secret);
  assert.equal(url.searchParams.get("issuer"), "Street Admin");
  assert.equal(url.searchParams.get("digits"), "6");
  assert.equal(url.searchParams.get("period"), "30");
  assert.equal(base32Decode(secret).length, 20, "160-bit secret");
});

test("the QR code is drawn locally as an SVG", async () => {
  const svg = await qrSvg(otpauthUrl(generateTotpSecret(), "me@example.com"));
  assert.match(svg, /^<\?xml|^<svg/);
  assert.match(svg, /<path/);
  assert.ok(svg.length > 500);
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(svg), "no external references");
});

test("setup then sign-in: the code from the app confirms setup, and the same code is refused afterwards", () => {
  const secret = generateTotpSecret();
  const now = Date.parse("2026-10-13T12:00:10Z");
  const code = totpCode(secret, now);
  const setupStep = verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now);
  assert.notEqual(setupStep, null, "a code typed with a space is accepted");
  assert.equal(verifyTotp(secret, code, now + 5_000, setupStep), null, "reusing the setup code to sign in straight away is refused");
  const nextCode = totpCode(secret, now + 30_000);
  assert.notEqual(verifyTotp(secret, nextCode, now + 31_000, setupStep), null, "the next code works");
  assert.equal(verifyTotp(secret, "000000", now), code === "000000" ? setupStep : null);
});
