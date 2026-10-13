"use server";

import { revalidatePath } from "next/cache";
import { supabaseRest } from "@/lib/supabase-rest";

export async function setVisitorFlagAction(formData: FormData) {
  const visitor = String(formData.get("visitor") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(visitor) || !["flagged", "allowed"].includes(status)) return;
  await supabaseRest("rpc/set_visitor_flag", {
    method: "POST",
    body: { p_visitor: visitor, p_status: status },
    prefer: "return=minimal",
  });
  revalidatePath("/admin/analytics/flagged");
  revalidatePath("/admin/analytics");
}
