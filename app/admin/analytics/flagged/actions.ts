"use server";

import { revalidatePath } from "next/cache";
import { supabaseRest } from "@/lib/supabase-rest";
import { actorOf, requirePermission } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/audit";

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
