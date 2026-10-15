"use server";

import { revalidatePath } from "next/cache";
import { supabaseRest } from "@/lib/supabase-rest";
import { actorOf, requirePermission } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/audit";
import { reactivateBotRule, releaseBotRule } from "@/lib/bot-guard";

export async function setVisitorFlagAction(formData: FormData) {
  const actor = await requirePermission("analytics.write");
  const visitor = String(formData.get("visitor") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(visitor) || !["flagged", "allowed"].includes(status)) return;
  await supabaseRest("rpc/set_visitor_flag", {
    method: "POST",
    body: { p_visitor: visitor, p_status: status },
    prefer: "return=minimal",
  });
  await recordAudit(actorOf(actor), { action: "analytics.visitor_flag", summary: `Marked a visitor ${status}`, targetType: "visitor", targetId: visitor });
  revalidatePath("/admin/analytics/flagged");
  revalidatePath("/admin/analytics");
}

/** Count a bot rule's visitors again (they stay recorded either way). */
export async function releaseBotRuleAction(formData: FormData) {
  const actor = await requirePermission("analytics.write");
  const id = String(formData.get("id") ?? "");
  await releaseBotRule(id);
  await recordAudit(actorOf(actor), { action: "analytics.bot_rule_release", summary: "Released an automatic bot filter; its visitors count again", targetType: "bot_rule", targetId: id });
  revalidatePath("/admin/analytics/flagged");
  revalidatePath("/admin/analytics");
}

/** Switch a released or expired bot rule back on for another 30 days. */
export async function reactivateBotRuleAction(formData: FormData) {
  const actor = await requirePermission("analytics.write");
  const id = String(formData.get("id") ?? "");
  await reactivateBotRule(id);
  await recordAudit(actorOf(actor), { action: "analytics.bot_rule_reactivate", summary: "Turned an automatic bot filter back on", targetType: "bot_rule", targetId: id });
  revalidatePath("/admin/analytics/flagged");
  revalidatePath("/admin/analytics");
}
