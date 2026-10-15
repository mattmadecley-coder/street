// @ts-nocheck -- run with `npm test` (Node's built-in runner).
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as db from "./fakes/supabase-rest.ts";
import { runBotGuard, listBotRules, releaseBotRule, reactivateBotRule } from "../lib/bot-guard.ts";

beforeEach(() => {
  db.__reset();
  db.__table("audit_log");
});

test("an automatic detection is recorded in the activity log with what was found", async () => {
  let asked;
  db.__rpc("detect_bot_bursts", (body) => { asked = body; return [{ id: "11111111-1111-4111-8111-111111111111", timezone: "Asia/Shanghai", screen_width: 1280, visitors: 2383, rows_excluded: 11304 }]; });
  const result = await runBotGuard();
  assert.equal(result.created.length, 1);
  assert.deepEqual(asked, { p_window: "90 minutes", p_min_visitors: 100 });
  const entry = db.__rows("audit_log")[0];
  assert.equal(entry.action, "analytics.bot_rule_auto");
  assert.equal(entry.actor_label, "automatic bot filter");
  assert.match(entry.summary, /2383 visitors, Asia\/Shanghai, 1280px/);
});

test("nothing found means nothing recorded", async () => {
  db.__rpc("detect_bot_bursts", () => []);
  assert.deepEqual(await runBotGuard(), { created: [], available: true });
  db.__rpc("detect_bot_bursts", () => null);
  assert.deepEqual((await runBotGuard()).created, []);
  assert.equal(db.__rows("audit_log").length, 0);
});

test("before the migration is applied it quietly reports 'not available'", async () => {
  assert.deepEqual(await runBotGuard(), { created: [], available: false });
});

test("a real database failure is not swallowed", async () => {
  db.__rpc("detect_bot_bursts", () => { throw new Error("connection refused"); });
  await assert.rejects(runBotGuard(), /connection refused/);
});

test("rules can be listed, released and switched back on; bad ids are refused", async () => {
  db.__table("analytics_bot_rules", [{ id: "11111111-1111-4111-8111-111111111111", label: "Automated burst: Asia/Shanghai, 1280px screen", timezone: "Asia/Shanghai", screen_width: 1280, active: true, released_at: null, expires_at: "2026-11-01T00:00:00Z", created_at: "2026-10-14T20:00:00Z" }]);
  db.__table("site_events", [{ timezone: "Asia/Shanghai", screen_width: 1280, excluded: false, created_at: new Date().toISOString() }, { timezone: "America/New_York", screen_width: 1920, excluded: false, created_at: new Date().toISOString() }]);
  assert.equal((await listBotRules()).length, 1);
  let released;
  db.__rpc("release_bot_rule", (body) => { released = body; return null; });
  await releaseBotRule("11111111-1111-4111-8111-111111111111");
  assert.deepEqual(released, { p_id: "11111111-1111-4111-8111-111111111111" });
  await reactivateBotRule("11111111-1111-4111-8111-111111111111");
  const [rule] = db.__rows("analytics_bot_rules");
  assert.equal(rule.active, true);
  assert.ok(Date.parse(rule.expires_at) > Date.now() + 29 * 86_400_000);
  const events = db.__rows("site_events");
  assert.equal(events[0].excluded, true, "matching events are excluded again");
  assert.equal(events[1].excluded, false, "others are untouched");
  await assert.rejects(releaseBotRule("nope"), /Unknown rule/);
  await assert.rejects(reactivateBotRule("not-a-uuid"), /Unknown rule/);
});
