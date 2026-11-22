import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";
import { isMissingTableError } from "@/lib/admin-state";
import { recordAudit } from "@/lib/audit";

/**
 * Automatic filter for crawler bursts (see supabase/migrations/20261021_bot_burst_rules.sql).
 * The detection itself runs inside the database; this wrapper calls it, records any new rule in the
 * activity log, and is run every ten minutes by the cron job.
 */
export type DetectedBurst = { id: string; timezone: string; screen_width: number; visitors: number; rows_excluded: number };

export async function runBotGuard(window = "90 minutes", minVisitors = 100): Promise<{ created: DetectedBurst[]; available: boolean }> {
  if (!hasSupabaseCatalog()) return { created: [], available: false };
  try {
    const result = await supabaseRest<DetectedBurst[] | null>("rpc/detect_bot_bursts", { method: "POST", body: { p_window: window, p_min_visitors: minVisitors }, noStore: true });
    const created = Array.isArray(result) ? result : [];
    for (const burst of created) {
      await recordAudit({ id: null, label: "automatic bot filter" }, {
        action: "analytics.bot_rule_auto",
        targetType: "bot_rule",
        targetId: burst.id,
        summary: `Excluded an automated traffic burst (${burst.visitors} visitors, ${burst.timezone}, ${burst.screen_width}px screen) from analytics`,
        details: { ...burst },
      });
    }
    return { created, available: true };
  } catch (error) {
    if (isMissingTableError(error) || /detect_bot_bursts|Could not find the function/i.test(error instanceof Error ? error.message : "")) return { created: [], available: false };
    throw error;
  }
}

export type BotRule = { id: string; label: string; timezone: string; screen_width: number; reason: string | null; visitors_at_detection: number | null; auto: boolean; active: boolean; created_at: string; expires_at: string; released_at: string | null };

export async function listBotRules(): Promise<BotRule[]> {
  if (!hasSupabaseCatalog()) return [];
  try {
    return await supabaseRest<BotRule[]>("analytics_bot_rules?select=*&order=created_at.desc&limit=50", { noStore: true });
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function releaseBotRule(id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Unknown rule.");
  await supabaseRest("rpc/release_bot_rule", { method: "POST", body: { p_id: id }, prefer: "return=minimal" });
}

// --- Real-time per-session burst guard -------------------------------------
//
// detect_bot_bursts() above catches a crawler wave once enough visitors share
// one exact (timezone, screen_width) fingerprint. The 2026-11-19/22 incident
// used a slightly different shape: screen width randomized per visit, so no
// single fingerprint ever crossed the volume threshold -- even though ~85% of
// "visitors" that week were single-page, no-referrer hits, many of which
// flooded dozens of broken_image reports from one page load (their network
// path couldn't reach the image hosts; see the Nov 22 analytics investigation).
//
// This guard catches that shape live, per session, without waiting for a
// volume threshold: once one session reports more than
// BROKEN_IMAGE_FLAG_THRESHOLD broken images, or more than EVENT_FLAG_THRESHOLD
// events total, within the tracking window, it flags that visitor through the
// existing set_visitor_flag RPC -- the same mechanism the outbound-click rule
// already uses -- which immediately excludes their rows so far and, via
// mark_excluded_on_insert, every future row too.
//
// In-memory only: fine for this single-instance deployment, and deliberately
// cheap (no extra DB round trip on every event write). A process restart just
// gives in-flight sessions a fresh few events of grace, which is an
// acceptable trade for not adding a query to the write path.

const BROKEN_IMAGE_DROP_THRESHOLD = 10; // stop writing more broken_image rows for this session past this point
const BROKEN_IMAGE_FLAG_THRESHOLD = 15; // flag the visitor once a session clearly looks automated
const EVENT_FLAG_THRESHOLD = 250; // any session this chatty in the window isn't a human either
const SESSION_WINDOW_MS = 30 * 60_000; // 30 minutes
const MAX_TRACKED_SESSIONS = 20_000; // bounds the map so a huge wave can't grow it without limit

type SessionCounters = { total: number; brokenImage: number; firstSeen: number; flagged: boolean };
const sessionCounters = new Map<string, SessionCounters>();

function pruneSessionCounters(now: number) {
  if (sessionCounters.size < MAX_TRACKED_SESSIONS) return;
  for (const [key, value] of sessionCounters) {
    if (now - value.firstSeen > SESSION_WINDOW_MS) sessionCounters.delete(key);
  }
}

export type BurstGuardDecision = { drop: boolean; flagging: boolean; reason?: string };

/** Call for every inbound analytics event, before it's written, keyed by session. */
export function trackEventForBurstGuard(sessionId: string, eventType: string): BurstGuardDecision {
  const now = Date.now();
  let counters = sessionCounters.get(sessionId);
  if (!counters || now - counters.firstSeen > SESSION_WINDOW_MS) {
    pruneSessionCounters(now);
    counters = { total: 0, brokenImage: 0, firstSeen: now, flagged: false };
    sessionCounters.set(sessionId, counters);
  }
  counters.total += 1;
  if (eventType === "broken_image") counters.brokenImage += 1;

  const brokenImageBurst = counters.brokenImage > BROKEN_IMAGE_FLAG_THRESHOLD;
  const chatterBurst = counters.total > EVENT_FLAG_THRESHOLD;
  const shouldFlag = (brokenImageBurst || chatterBurst) && !counters.flagged;
  if (shouldFlag) counters.flagged = true;

  const drop = eventType === "broken_image" && counters.brokenImage > BROKEN_IMAGE_DROP_THRESHOLD;
  return {
    drop,
    flagging: shouldFlag,
    reason: shouldFlag ? (brokenImageBurst ? "many broken-image reports in one session" : "unusually high event volume in one session") : undefined,
  };
}

/** Flags a visitor the same way the outbound-click rule does, for an automated-looking session caught live. */
export async function flagBurstVisitor(anonymousUserId: string, reason: string): Promise<void> {
  if (!hasSupabaseCatalog()) return;
  try {
    await supabaseRest("rpc/set_visitor_flag", { method: "POST", body: { p_visitor: anonymousUserId, p_status: "flagged" }, prefer: "return=minimal" });
    await recordAudit({ id: null, label: "automatic bot filter" }, {
      action: "analytics.bot_rule_auto",
      targetType: "visitor",
      targetId: anonymousUserId,
      summary: `Flagged a visitor live: ${reason}`,
    });
  } catch (error) {
    console.error("Street live bot-flag failed", error);
  }
}

/** Turns a released or expired rule back on for another 30 days (excludes matching rows again). */
export async function reactivateBotRule(id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Unknown rule.");
  const rows = await supabaseRest<BotRule[]>(`analytics_bot_rules?id=eq.${id}&select=*&limit=1`, { noStore: true });
  const rule = rows[0];
  if (!rule) throw new Error("Unknown rule.");
  await supabaseRest(`analytics_bot_rules?id=eq.${id}`, { method: "PATCH", body: { active: true, released_at: null, expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() }, prefer: "return=minimal" });
  await supabaseRest(`site_events?timezone=eq.${encodeURIComponent(rule.timezone)}&screen_width=eq.${rule.screen_width}&excluded=is.false&created_at=gte.${encodeURIComponent(new Date(Date.now() - 8 * 86_400_000).toISOString())}`, { method: "PATCH", body: { excluded: true }, prefer: "return=minimal" });
}
