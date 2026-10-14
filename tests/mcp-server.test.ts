// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import * as db from "./fakes/supabase-rest.ts";
import { createToken, verifyToken, revokeToken, hashToken, listTokens, looksLikeToken, generateToken, MAX_TOKENS_PER_USER } from "../lib/mcp-tokens.ts";
import { handleMessage, handleBody } from "../lib/mcp/server.ts";
import { toolsFor, TOOLS } from "../lib/mcp/tools.ts";
import { POST as mcpPost, GET as mcpGet } from "../app/api/mcp/route.ts";

const NOW = Date.parse("2026-10-14T15:00:00Z");
const realFetch = globalThis.fetch;
let calls = [];

const OWNER = "40000000-0000-4000-8000-000000000001";
const ANALYST = "40000000-0000-4000-8000-000000000002";
const MARKETER = "40000000-0000-4000-8000-000000000003";

beforeEach(() => {
  db.__reset();
  db.__table("admin_users", [
    { id: OWNER, email: "owner@x.com", name: "Owner", role: "owner", is_active: true },
    { id: ANALYST, email: "analyst@x.com", name: "Analyst", role: "analyst", is_active: true },
    { id: MARKETER, email: "mkt@x.com", name: "Marketer", role: "marketing", is_active: true },
  ]);
  db.__table("admin_api_tokens");
  db.__table("audit_log");
  db.__table("email_segments");
  db.__table("email_templates");
  db.__table("email_campaigns");
  db.__table("email_campaign_sends");
  db.__table("email_contact_events");
  db.__table("admin_state");
  db.__table("products");
  const contacts = Array.from({ length: 4 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, email: `p${i + 1}@x.com`, token: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, status: i === 3 ? "unsubscribed" : "subscribed", phone: i === 0 ? "+1555" : null, tags: [], created_at: "2026-10-01T00:00:00Z", emails_sent: 0, open_count: 0, click_count: 0, last_opened_at: null, last_clicked_at: null, source: "popup", utm_source: null, utm_medium: null, utm_campaign: null, device_type: "mobile", signup_path: "/" }));
  db.__table("email_contacts", contacts);
  process.env.RESEND_API_KEY = "re_test";
  process.env.BRAND_REPORTS_MAILING_ADDRESS = "1 Main St";
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    const list = Array.isArray(JSON.parse(init.body)) ? JSON.parse(init.body) : [1];
    return { ok: true, status: 200, json: async () => (String(url).endsWith("/batch") ? { data: list.map((_, i) => ({ id: `re_${i}` })) } : { id: "re_single" }) };
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

async function principalFor(userId, canSend = false) {
  const { token } = await createToken({ userId, name: "test token", canSend }, NOW);
  return { token, principal: await verifyToken(token, NOW + 1000) };
}
const rpc = (principal, method, params, id = 1) => handleMessage({ jsonrpc: "2.0", id, method, params }, principal, { nowMs: NOW, runInBackground: (job) => calls.push({ background: true }) });
const call = async (principal, name, args = {}) => {
  const res = await rpc(principal, "tools/call", { name, arguments: args });
  const text = res.result.content[0].text;
  return { isError: res.result.isError, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
};

test("tokens: only a hash is stored, and the token works until revoked or expired", async () => {
  const { token, row } = await createToken({ userId: OWNER, name: "  Claude   laptop " }, NOW);
  assert.ok(looksLikeToken(token));
  assert.equal(row.name, "Claude laptop");
  const stored = db.__rows("admin_api_tokens")[0];
  assert.equal(stored.token_hash, hashToken(token));
  assert.ok(!JSON.stringify(stored).includes(token), "the token itself is never stored");
  assert.ok(token.startsWith(stored.token_prefix));
  const principal = await verifyToken(token, NOW + 1000);
  assert.deepEqual([principal.email, principal.role, principal.canSend], ["owner@x.com", "owner", false]);
  assert.equal(await verifyToken(token + "x", NOW), null);
  assert.equal(await verifyToken("street_mcp_" + "a".repeat(43), NOW), null);
  assert.equal(await verifyToken(token, NOW + 91 * 86_400_000), null, "expires after 90 days by default");
  assert.equal(await revokeToken(OWNER, row.id, NOW), true);
  assert.equal(await verifyToken(token, NOW + 1000), null);
  assert.equal(await revokeToken(ANALYST, row.id, NOW), false, "only the owner can revoke it");
});

test("tokens: need a name, are limited in number, and stop working when the person is deactivated", async () => {
  await assert.rejects(createToken({ userId: OWNER, name: "  " }, NOW), /name/);
  for (let i = 0; i < MAX_TOKENS_PER_USER; i += 1) await createToken({ userId: OWNER, name: `t${i}` }, NOW);
  await assert.rejects(createToken({ userId: OWNER, name: "one more" }, NOW), /up to/);
  const { token } = await principalFor(MARKETER);
  db.__update("admin_users", (u) => u.id === MARKETER, { is_active: false });
  assert.equal(await verifyToken(token, NOW + 1000), null);
  assert.equal((await listTokens(OWNER)).length, MAX_TOKENS_PER_USER);
  assert.ok(!looksLikeToken(generateToken().slice(0, 20)));
});

test("protocol: initialize, ping, unknown methods, notifications, batches", async () => {
  const { principal } = await principalFor(OWNER);
  const init = await rpc(principal, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "x", version: "1" } });
  assert.equal(init.result.protocolVersion, "2025-03-26");
  assert.equal(init.result.serverInfo.name, "street-admin");
  assert.ok(init.result.capabilities.tools);
  assert.equal((await rpc(principal, "initialize", { protocolVersion: "1999-01-01" })).result.protocolVersion, "2025-06-18");
  assert.deepEqual((await rpc(principal, "ping")).result, {});
  assert.equal((await rpc(principal, "nope")).error.code, -32601);
  assert.equal(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, principal), null);
  assert.equal((await handleMessage("junk", principal)).error.code, -32600);
  const batch = await handleBody([{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", id: 2, method: "ping" }], principal);
  assert.equal(batch.length, 2);
  assert.equal(await handleBody([{ jsonrpc: "2.0", method: "notifications/initialized" }], principal), null);
});

test("tools/list shows only what this role and token may use", async () => {
  const names = async (principal) => (await rpc(principal, "tools/list")).result.tools.map((t) => t.name);
  const owner = (await principalFor(OWNER, false)).principal;
  const ownerSend = (await principalFor(OWNER, true)).principal;
  const analyst = (await principalFor(ANALYST, false)).principal;
  const marketer = (await principalFor(MARKETER, true)).principal;
  const ownerNames = await names(owner);
  assert.ok(ownerNames.includes("create_template") && ownerNames.includes("email_guide"));
  assert.ok(!ownerNames.includes("send_campaign"), "an owner's token cannot send unless sending was enabled on the token");
  assert.ok((await names(ownerSend)).includes("send_campaign"));
  const analystNames = await names(analyst);
  assert.ok(analystNames.includes("list_segments") && !analystNames.includes("create_segment"), "analysts are read-only");
  assert.ok(!(await names(marketer)).includes("send_campaign"), "marketing has no send permission even with a send token");
  assert.ok(TOOLS.filter((t) => t.sends).every((t) => t.permission === "email.send"));
  for (const tool of toolsFor(ownerSend)) assert.equal(tool.inputSchema.type, "object", tool.name);
});

test("calling a tool the token cannot use is refused with an explanation, and changes nothing", async () => {
  const { principal } = await principalFor(ANALYST);
  const result = await call(principal, "create_segment", { name: "x", definition: { conditions: [] } });
  assert.equal(result.isError, true);
  assert.match(result.text, /not available to this token/);
  assert.equal(db.__rows("email_segments").length, 0);
  const noSend = (await principalFor(OWNER, false)).principal;
  const blocked = await call(noSend, "send_campaign", { campaign_id: "50000000-0000-4000-8000-000000000001", confirm_recipients: 1 });
  assert.equal(blocked.isError, true);
  assert.match(blocked.text, /sending enabled/);
  assert.equal(calls.length, 0);
});

test("segments: strict validation, preview with masked addresses, create and audit", async () => {
  const { principal } = await principalFor(OWNER);
  const bad = await call(principal, "create_segment", { name: "Bad", definition: { match: "all", conditions: [{ type: "tag", op: "has" }, { type: "wat" }] } });
  assert.equal(bad.isError, true);
  assert.match(bad.text, /invalid or unknown/);
  assert.equal(db.__rows("email_segments").length, 0);
  const preview = await call(principal, "preview_segment", { definition: { match: "all", conditions: [{ type: "phone", op: "has" }] } });
  assert.equal(preview.json.sendable, 1);
  assert.match(preview.json.sample[0].email, /^p\*\*\*@x\.com$/);
  const created = await call(principal, "create_segment", { name: "Phone people", definition: { match: "all", conditions: [{ type: "phone", op: "has" }] } });
  assert.equal(created.isError, false);
  const duplicate = await call(principal, "create_segment", { name: "Phone people", definition: { match: "all", conditions: [] } });
  assert.match(duplicate.text, /already exists/);
  assert.match(created.json.link, /\/admin\/email\/segments\//);
  const audit = db.__rows("audit_log").find((row) => row.action === "email.segment_create");
  assert.match(audit.actor_label, /owner@x\.com via MCP token “test token”/);
  assert.equal(audit.actor_id, OWNER);
  const list = await call(principal, "list_segments");
  assert.equal(list.json[0].sendable, 1);
});

test("templates: strict problems are listed, valid ones are created and can be previewed", async () => {
  const { principal } = await principalFor(MARKETER);
  const bad = await call(principal, "create_template", { name: "Bad", blocks: [{ type: "image", url: "javascript:alert(1)" }, { type: "carousel" }, { type: "button", label: "Go", url: "not a url" }] });
  assert.equal(bad.isError, true);
  assert.match(bad.text, /blocks\[0\]/);
  assert.match(bad.text, /blocks\[1\]\.type must be one of/);
  assert.match(bad.text, /blocks\[2\]\.url is not a valid link/);
  assert.equal(db.__rows("email_templates").length, 0);
  const made = await call(principal, "create_template", { name: "Spring", subject: "Spring drop", blocks: [{ type: "heading", text: "Spring" }, { type: "text", text: "Hello **there**" }, { type: "button", label: "Shop", url: "https://streetdotcom.com" }] });
  assert.equal(made.isError, false, made.text);
  const preview = await call(principal, "preview_template", { id: made.json.id });
  assert.equal(preview.json.subject, "Spring drop");
  assert.match(preview.json.text, /Hello there/);
  assert.match(preview.json.text, /Unsubscribe:/);
  const fromPreset = await call(principal, "create_template", { preset: "new-arrivals" });
  assert.equal(fromPreset.isError, false);
  const updated = await call(principal, "update_template", { id: made.json.id, subject: "New subject" });
  assert.equal(updated.isError, false);
  assert.equal((await call(principal, "get_template", { id: made.json.id })).json.subject, "New subject");
  assert.equal((await call(principal, "get_template", { id: "nope" })).isError, true);
});

test("campaign drafts: created without sending anything, test goes only to the token owner", async () => {
  const { principal } = await principalFor(OWNER);
  const seg = (await call(principal, "create_segment", { name: "All", definition: { match: "all", conditions: [{ type: "status", op: "is", value: "subscribed" }] } })).json;
  const tpl = (await call(principal, "create_template", { preset: "announcement", subject: "Hi" })).json;
  const draft = await call(principal, "create_campaign_draft", { name: "Test run", template_id: tpl.id, segment_id: seg.id });
  assert.equal(draft.isError, false, draft.text);
  assert.equal(draft.json.audienceNow, 3);
  assert.equal(draft.json.status, "draft");
  assert.equal(calls.length, 0, "a draft sends nothing");
  const test = await call(principal, "send_test_email", { campaign_id: draft.json.id });
  assert.equal(test.json.sentTo, "owner@x.com");
  assert.deepEqual(calls[0].body.to, ["owner@x.com"]);
  assert.match(calls[0].body.subject, /^\[TEST\]/);
  assert.equal((await call(principal, "create_campaign_draft", { name: "x", template_id: tpl.id, segment_id: "11111111-1111-4111-8111-111111111111" })).isError, true);
  const got = await call(principal, "get_campaign", { id: draft.json.id });
  assert.equal(got.json.results, null);
});

test("sending needs a send token, the exact audience count, and then really sends", async () => {
  const { principal } = await principalFor(OWNER, true);
  const seg = (await call(principal, "create_segment", { name: "All", definition: { match: "all", conditions: [{ type: "status", op: "is", value: "subscribed" }] } })).json;
  const tpl = (await call(principal, "create_template", { preset: "announcement", subject: "Hi" })).json;
  const draft = (await call(principal, "create_campaign_draft", { name: "Go", template_id: tpl.id, segment_id: seg.id })).json;
  const wrong = await call(principal, "send_campaign", { campaign_id: draft.id, confirm_recipients: 99 });
  assert.equal(wrong.isError, true);
  assert.match(wrong.text, /audience is 3 people right now/);
  assert.equal(calls.length, 0);
  const sent = await call(principal, "send_campaign", { campaign_id: draft.id, confirm_recipients: 3 });
  assert.equal(sent.isError, false, sent.text);
  assert.equal(sent.json.recipients, 3);
  assert.ok(calls.some((entry) => entry.background), "sending runs in the background");
  assert.equal((await call(principal, "get_campaign", { id: draft.id })).json.status, "sending");
  const cancel = await call(principal, "cancel_campaign", { campaign_id: draft.id });
  assert.equal(cancel.json.status, "canceled");
  const actions = db.__rows("audit_log").map((row) => row.action);
  assert.ok(actions.includes("email.campaign_send") && actions.includes("email.campaign_cancel"));
});

test("scheduling validates the time and the audience size", async () => {
  const { principal } = await principalFor(OWNER, true);
  const seg = (await call(principal, "create_segment", { name: "All", definition: { match: "all", conditions: [] } })).json;
  const tpl = (await call(principal, "create_template", { preset: "announcement", subject: "Hi" })).json;
  const draft = (await call(principal, "create_campaign_draft", { name: "Later", template_id: tpl.id, segment_id: seg.id })).json;
  const past = await call(principal, "schedule_campaign", { campaign_id: draft.id, send_at: "2020-01-01T00:00:00Z", confirm_recipients: draft.audienceNow });
  assert.equal(past.isError, true);
  assert.match(past.text, /send time is in the past/, "the assistant is told the real reason");
  const ok = await call(principal, "schedule_campaign", { campaign_id: draft.id, send_at: new Date(NOW + 3_600_000).toISOString(), confirm_recipients: draft.audienceNow });
  assert.equal(ok.isError, false, ok.text);
  assert.equal(ok.json.status, "scheduled");
  assert.equal(calls.filter((c) => c.url?.includes("resend")).length, 0, "nothing is emailed until the time comes");
});

test("overview gives counts only, no personal details", async () => {
  const { principal } = await principalFor(ANALYST);
  const result = await call(principal, "email_overview");
  assert.deepEqual([result.json.total, result.json.subscribed, result.json.unsubscribed, result.json.withPhone], [4, 3, 1, 1]);
  assert.ok(!result.text.includes("@x.com"));
  assert.ok((await call(principal, "email_guide")).json.blockTypes.products);
});

test("the HTTP endpoint: no token or a bad token is 401, a good one works, GET is not allowed", async () => {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const make = (headers = {}) => new NextRequest("https://streetdotcom.com/api/mcp", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
  assert.equal((await mcpPost(make())).status, 401);
  assert.equal((await mcpPost(make({ authorization: "Bearer street_mcp_nope" }))).status, 401);
  assert.equal((await mcpPost(make({ authorization: "Bearer " + "x".repeat(60) }))).status, 401);
  const { token } = await principalFor(OWNER);
  const res = await mcpPost(make({ authorization: `Bearer ${token}` }));
  assert.equal(res.status, 200);
  assert.ok((await res.json()).result.tools.length > 5);
  const note = await mcpPost(new NextRequest("https://streetdotcom.com/api/mcp", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }));
  assert.equal(note.status, 202);
  assert.equal((await mcpPost(new NextRequest("https://streetdotcom.com/api/mcp", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: "{not json" }))).status, 400);
  assert.equal((await mcpGet()).status, 405);
});
