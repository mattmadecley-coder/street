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

/** Turns a released or expired rule back on for another 30 days (excludes matching rows again). */
export async function reactivateBotRule(id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Unknown rule.");
  const rows = await supabaseRest<BotRule[]>(`analytics_bot_rules?id=eq.${id}&select=*&limit=1`, { noStore: true });
  const rule = rows[0];
  if (!rule) throw new Error("Unknown rule.");
  await supabaseRest(`analytics_bot_rules?id=eq.${id}`, { method: "PATCH", body: { active: true, released_at: null, expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() }, prefer: "return=minimal" });
  await supabaseRest(`site_events?timezone=eq.${encodeURIComponent(rule.timezone)}&screen_width=eq.${rule.screen_width}&excluded=is.false&created_at=gte.${encodeURIComponent(new Date(Date.now() - 8 * 86_400_000).toISOString())}`, { method: "PATCH", body: { excluded: true }, prefer: "return=minimal" });
}
