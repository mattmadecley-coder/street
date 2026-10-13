// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as db from "./fakes/supabase-rest.ts";
import { sendingProblems, buildMessage, prepareCampaign, processCampaignBatch, cancelCampaign, runEmailQueue, audienceFor, sendTestEmail } from "../lib/email-send.ts";
import { getCampaign, saveDraft, createCampaign, computeStats, parseScheduledAt } from "../lib/email-campaigns.ts";
import { TEMPLATE_PRESETS, defaultBlock } from "../lib/email-blocks.ts";
import { cleanSettings, fromAddress } from "../lib/email-settings.ts";

const NOW = Date.parse("2026-10-14T15:00:00Z");
const realFetch = globalThis.fetch;
let calls = [];
let failNext = 0;

function mockResend() {
  process.env.RESEND_API_KEY = "re_test";
  process.env.BRAND_REPORTS_MAILING_ADDRESS = "1 Main St, Town, ST 00000";
  calls = [];
  failNext = 0;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), headers: init.headers, body });
    if (failNext > 0) { failNext -= 1; return { ok: false, status: 422, json: async () => ({ message: "Validation error" }) }; }
    const list = Array.isArray(body) ? body : [body];
    return { ok: true, status: 200, json: async () => (String(url).endsWith("/batch") ? { data: list.map((_, i) => ({ id: `re_${calls.length}_${i}` })) } : { id: "re_single" }) };
  };
}

const contact = (n, over = {}) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, email: `p${n}@x.com`, token: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`, status: "subscribed", phone: null, tags: [], created_at: "2026-09-01T00:00:00Z", emails_sent: 0, open_count: 0, click_count: 0, last_opened_at: null, last_clicked_at: null, source: "popup", utm_source: null, utm_medium: null, utm_campaign: null, device_type: "mobile", signup_path: "/", ...over });

const TEMPLATE_ID = "20000000-0000-4000-8000-000000000001";
const SEGMENT_ID = "30000000-0000-4000-8000-000000000001";

function seed(contacts, { subject = "Hello", blocks = [defaultBlock("heading", () => "h1"), defaultBlock("text", () => "t1")] } = {}) {
  db.__reset();
  db.__table("email_contacts", contacts);
  db.__table("email_templates", [{ id: TEMPLATE_ID, name: "T", subject, preheader: "", design: {}, blocks }]);
  db.__table("email_segments", [{ id: SEGMENT_ID, name: "S", description: "", definition: { match: "all", conditions: [] } }]);
  db.__table("email_campaigns");
  db.__table("email_campaign_sends");
  db.__table("admin_state");
  db.__table("email_contact_events");
}

async function draft(over = {}) {
  const id = await createCampaign("me@x.com", "Test");
  await saveDraft(id, { templateId: TEMPLATE_ID, segmentId: SEGMENT_ID, ...over }, NOW);
  return getCampaign(id);
}

beforeEach(mockResend);
afterEach(() => { globalThis.fetch = realFetch; });

test("sending is blocked without an API key or a mailing address", () => {
  assert.equal(sendingProblems({ apiKey: "k", mailingAddress: "x" }).length, 0);
  assert.match(sendingProblems({ apiKey: "", mailingAddress: "x" })[0], /RESEND_API_KEY/);
  assert.match(sendingProblems({ apiKey: "k", mailingAddress: "" })[0], /mailing address/);
});

test("settings: sender is always on the sending subdomain, junk falls back to defaults", () => {
  const s = cleanSettings({ fromName: 'Evil <x@y.com>"', fromLocal: "Hello There!", replyTo: "nope", dailyCap: -5 });
  assert.equal(s.fromLocal, "hello");
  assert.equal(s.replyTo, "hello@streetdotcom.com");
  assert.equal(s.dailyCap, 300);
  assert.ok(!/[<>"]/.test(s.fromName));
  assert.match(fromAddress(cleanSettings({ fromName: "Street", fromLocal: "news" })), /^Street <news@mail\.streetdotcom\.com>$/);
});

test("message: one-click unsubscribe headers, per-person link, campaign tag", () => {
  const t = TEMPLATE_PRESETS[1].build();
  const msg = buildMessage(t, "Subj", "", { email: "a@x.com", token: "10000000-0000-4000-8000-000000000001" }, "camp-1", cleanSettings({}), "1 Main St", {});
  assert.deepEqual(msg.to, ["a@x.com"]);
  assert.match(msg.headers["List-Unsubscribe"], /^<https:\/\/streetdotcom\.com\/api\/email\/unsubscribe\?t=10000000-0000-4000-8000-000000000001&c=camp-1>$/);
  assert.equal(msg.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(msg.html, /unsubscribe\?t=10000000-0000-4000-8000-000000000001/);
  assert.deepEqual(msg.tags, [{ name: "campaign_id", value: "camp-1" }]);
  assert.match(msg.from, /@mail\.streetdotcom\.com>$/);
});

test("audience: only subscribed people who match", async () => {
  seed([contact(1), contact(2, { status: "unsubscribed" }), contact(3, { status: "bounced" }), contact(4, { phone: "+1555" })]);
  assert.equal((await audienceFor({ match: "all", conditions: [] }, NOW)).length, 2);
  assert.deepEqual((await audienceFor({ match: "all", conditions: [{ type: "phone", op: "has" }] }, NOW)).map((c) => c.email), ["p4@x.com"]);
});

test("prepare: refuses missing pieces with a plain reason", async () => {
  seed([contact(1)], { subject: "" });
  const c = await createCampaign("me", "x");
  assert.match((await prepareCampaign(await getCampaign(c), "send_now", NOW)).error, /template/i);
  await saveDraft(c, { templateId: TEMPLATE_ID }, NOW);
  assert.match((await prepareCampaign(await getCampaign(c), "send_now", NOW)).error, /who it goes to/i);
  await saveDraft(c, { segmentId: SEGMENT_ID }, NOW);
  assert.match((await prepareCampaign(await getCampaign(c), "send_now", NOW)).error, /subject/i);
  await saveDraft(c, { subject: "Hi" }, NOW);
  assert.equal((await prepareCampaign(await getCampaign(c), "send_now", NOW)).ok, true);
  assert.match((await prepareCampaign(await getCampaign(c), "send_now", NOW)).error, /already/);
  seed([contact(1, { status: "unsubscribed" })]);
  const d = await draft({ subject: "Hi" });
  assert.match((await prepareCampaign(d, "send_now", NOW)).error, /Nobody/);
});

test("send now: queues the audience, freezes content, then a batch sends everyone once", async () => {
  seed([contact(1), contact(2), contact(3, { status: "unsubscribed" })]);
  const c = await draft({ subject: "Big news" });
  const prepared = await prepareCampaign(c, "send_now", NOW);
  assert.deepEqual(prepared, { ok: true, recipients: 2 });
  const after = await getCampaign(c.id);
  assert.equal(after.status, "sending");
  assert.equal(after.content.blocks.length, 2);
  assert.equal(after.recipients_total, 2);
  assert.equal(db.__rows("email_campaign_sends").length, 2);

  const outcome = await processCampaignBatch(c.id, NOW);
  assert.deepEqual([outcome.sent, outcome.remaining, outcome.done], [2, 0, true]);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/emails/batch"));
  assert.equal(calls[0].body.length, 2);
  assert.ok(calls[0].headers["Idempotency-Key"]);
  assert.equal(calls[0].body[0].subject, "Big news");
  assert.ok(db.__rows("email_campaign_sends").every((row) => row.status === "sent" && row.resend_id && row.sent_at));
  assert.equal((await getCampaign(c.id)).status, "sent");
  assert.deepEqual(db.__rows("email_contacts").map((row) => row.emails_sent), [1, 1, 0], "received-count goes up for each person emailed");
  assert.equal(db.__rows("email_contact_events").filter((e) => e.type === "email_sent").length, 2);
  // Nothing more to do, and nothing is sent twice.
  assert.equal((await processCampaignBatch(c.id, NOW)).done, true);
  assert.equal(calls.length, 1);
});

test("someone who unsubscribes after queuing is skipped, not emailed", async () => {
  seed([contact(1), contact(2)]);
  const c = await draft({ subject: "Hi" });
  await prepareCampaign(c, "send_now", NOW);
  db.__update("email_contacts", (row) => row.email === "p2@x.com", { status: "unsubscribed" });
  const outcome = await processCampaignBatch(c.id, NOW);
  assert.equal(outcome.sent, 1);
  assert.equal(outcome.skipped, 1);
  assert.deepEqual(calls[0].body.map((m) => m.to[0]), ["p1@x.com"]);
  assert.equal(db.__rows("email_campaign_sends").find((row) => row.email === "p2@x.com").status, "skipped");
});

test("a failing batch is retried and gives up after three tries", async () => {
  seed([contact(1)]);
  const c = await draft({ subject: "Hi" });
  await prepareCampaign(c, "send_now", NOW);
  failNext = 3;
  assert.equal((await processCampaignBatch(c.id, NOW)).failed, 1);
  assert.equal(db.__rows("email_campaign_sends")[0].status, "queued");
  await processCampaignBatch(c.id, NOW);
  const last = await processCampaignBatch(c.id, NOW);
  assert.equal(last.done, true);
  assert.equal(db.__rows("email_campaign_sends")[0].status, "failed");
  assert.match(db.__rows("email_campaign_sends")[0].error, /Validation/);
  assert.equal((await getCampaign(c.id)).status, "sent");
});

test("the daily cap stops sending and leaves the rest queued", async () => {
  seed(Array.from({ length: 5 }, (_, i) => contact(i + 1)));
  db.__push("admin_state", { key: "email_settings", value: { dailyCap: 2 } });
  const c = await draft({ subject: "Hi" });
  await prepareCampaign(c, "send_now", NOW);
  const first = await processCampaignBatch(c.id, NOW);
  assert.equal(first.sent, 2);
  assert.equal(first.remaining, 3);
  const second = await processCampaignBatch(c.id, NOW + 1000);
  assert.deepEqual([second.sent, second.capped, second.remaining], [0, true, 3]);
  assert.equal((await getCampaign(c.id)).status, "sending");
  const nextDay = await processCampaignBatch(c.id, NOW + 25 * 3_600_000);
  assert.equal(nextDay.sent, 2, "a day later the cap window has moved");
});

test("scheduled campaigns start only when due; queue run sends them", async () => {
  seed([contact(1), contact(2)]);
  const c = await draft({ subject: "Later", scheduledAt: new Date(NOW + 3_600_000).toISOString() });
  assert.deepEqual(await prepareCampaign(c, "schedule", NOW), { ok: true, recipients: 2 });
  assert.equal((await getCampaign(c.id)).status, "scheduled");
  assert.equal(db.__rows("email_campaign_sends").length, 0, "nothing is queued until the time comes");
  const early = await runEmailQueue(NOW, 5000, 0);
  assert.equal(early.started, 0);
  assert.equal(calls.length, 0);
  const due = await runEmailQueue(NOW + 3_700_000, 5000, 0);
  assert.equal(due.started, 1);
  assert.equal(due.sent, 2);
  assert.equal((await getCampaign(c.id)).status, "sent");
});

test("queue run does nothing and says why when sending is not configured", async () => {
  seed([contact(1)]);
  process.env.BRAND_REPORTS_MAILING_ADDRESS = "";
  const result = await runEmailQueue(NOW, 1000, 0);
  assert.match(result.blocked, /mailing address/);
  assert.equal(calls.length, 0);
});

test("cancel drops everything not yet sent", async () => {
  seed([contact(1), contact(2)]);
  const c = await draft({ subject: "Hi" });
  await prepareCampaign(c, "send_now", NOW);
  await cancelCampaign(c.id, NOW);
  assert.equal((await getCampaign(c.id)).status, "canceled");
  assert.ok(db.__rows("email_campaign_sends").every((row) => row.status === "skipped"));
  assert.equal((await processCampaignBatch(c.id, NOW)).done, true);
  assert.equal(calls.length, 0);
});

test("a test email goes to one address with a marked subject", async () => {
  seed([contact(1)]);
  const result = await sendTestEmail({ content: TEMPLATE_PRESETS[1].build(), subject: "Preview me", preheader: "", to: "me@x.com", campaignId: "c1" });
  assert.equal(result.ok, true);
  assert.ok(calls[0].url.endsWith("/emails"));
  assert.equal(calls[0].body.subject, "[TEST] Preview me");
  assert.deepEqual(calls[0].body.to, ["me@x.com"]);
});

test("schedule times: past, nonsense and far-future are refused", () => {
  assert.equal(parseScheduledAt("", NOW), null);
  assert.throws(() => parseScheduledAt("yesterday-ish", NOW), /valid date/);
  assert.throws(() => parseScheduledAt("2026-10-01T00:00:00Z", NOW), /past/);
  assert.throws(() => parseScheduledAt("2030-01-01T00:00:00Z", NOW), /within the next year/);
  assert.equal(parseScheduledAt("2026-10-15T12:00:00Z", NOW), "2026-10-15T12:00:00.000Z");
});

test("stats count people, not events", () => {
  const rows = [
    { status: "sent", delivered_at: "x", first_opened_at: "x", open_count: 3, first_clicked_at: "x", click_count: 2, bounced_at: null, complained_at: null },
    { status: "sent", delivered_at: "x", first_opened_at: null, open_count: 0, first_clicked_at: null, click_count: 1, bounced_at: null, complained_at: null },
    { status: "sent", delivered_at: null, first_opened_at: null, open_count: 0, first_clicked_at: null, click_count: 0, bounced_at: "x", complained_at: null },
    { status: "queued" }, { status: "skipped" }, { status: "failed" },
  ];
  const s = computeStats(rows, 1);
  assert.deepEqual([s.recipients, s.sent, s.queued, s.skipped, s.failed, s.delivered, s.opened, s.clicked, s.bounced, s.unsubscribed], [6, 3, 1, 1, 1, 2, 2, 2, 1, 1]);
});
