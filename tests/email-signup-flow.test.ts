// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as db from "./fakes/supabase-rest.ts";
import { POST as subscribe } from "../app/api/email/subscribe/route.ts";
import { POST as addPhone } from "../app/api/email/phone/route.ts";

let n = 0;
const post = (handler, body) => handler(new Request("https://streetdotcom.com/api/email/x", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${++n}`, "user-agent": "Mozilla/5.0 (iPhone)" }, body: JSON.stringify(body) }));

beforeEach(() => { db.__reset(); db.__table("email_contacts"); db.__table("email_contact_events"); });

test("step 1: an email alone creates a subscribed customer immediately", async () => {
  const res = await post(subscribe, { email: "  Sam@Example.com ", anonymousId: "anon-1", source: "popup", pagePath: "/catalog", utmSource: "tiktok" });
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.token);
  const rows = db.__rows("email_contacts");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, "sam@example.com");
  assert.equal(rows[0].status, "subscribed");
  assert.equal(rows[0].phone, null, "no phone yet, and that is fine");
  assert.deepEqual(rows[0].anonymous_ids, ["anon-1"]);
  assert.equal(rows[0].utm_source, "tiktok");
  assert.equal(rows[0].device_type, "mobile");
  assert.ok(rows[0].consent_email_at);
  assert.equal(db.__rows("email_contact_events")[0].type, "signed_up");
});

test("step 2: the phone number is saved on that same customer", async () => {
  const { token } = await (await post(subscribe, { email: "sam@example.com" })).json();
  const res = await post(addPhone, { token, phone: "(555) 123-4567" });
  assert.equal((await res.json()).ok, true);
  const rows = db.__rows("email_contacts");
  assert.equal(rows.length, 1, "still one customer");
  assert.equal(rows[0].phone, "+15551234567");
  assert.ok(rows[0].phone_added_at && rows[0].consent_sms_at);
  assert.deepEqual(db.__rows("email_contact_events").map((e) => e.type), ["signed_up", "phone_added"]);
});

test("closing after step 1 keeps the customer with no phone", async () => {
  await post(subscribe, { email: "only-email@example.com" });
  const rows = db.__rows("email_contacts");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].phone, null);
  assert.equal(rows[0].status, "subscribed");
});

test("signing up again does not duplicate, and brings back someone who unsubscribed", async () => {
  const first = await (await post(subscribe, { email: "sam@example.com", anonymousId: "a1" })).json();
  db.__rows("email_contacts")[0].status = "unsubscribed";
  const again = await (await post(subscribe, { email: "SAM@example.com", anonymousId: "a2" })).json();
  assert.equal(again.returning, true);
  assert.equal(again.token, first.token);
  const rows = db.__rows("email_contacts");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "subscribed");
  assert.deepEqual(rows[0].anonymous_ids.sort(), ["a1", "a2"]);
});

test("bad input is refused and nothing is saved", async () => {
  assert.equal((await post(subscribe, { email: "not-an-email" })).status, 400);
  assert.equal((await post(addPhone, { token: "nope", phone: "5551234567" })).status, 400);
  const { token } = await (await post(subscribe, { email: "a@b.co" })).json();
  assert.equal((await post(addPhone, { token, phone: "123" })).status, 400);
  assert.equal(db.__rows("email_contacts")[0].phone, null);
  assert.equal((await post(addPhone, { token: "00000000-0000-4000-8000-000000000000", phone: "5551234567" })).status, 404);
  // The hidden honeypot field pretends to succeed but saves nothing.
  const bot = await (await post(subscribe, { email: "bot@spam.com", website: "http://spam" })).json();
  assert.equal(bot.ok, true);
  assert.equal(db.__rows("email_contacts").length, 1);
});
