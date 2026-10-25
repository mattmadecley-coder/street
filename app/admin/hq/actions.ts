"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorOf, requirePermission } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/audit";
import { hasHqAnswerWriteSource, submitPendingHqAnswer } from "@/lib/hq-pending-answers";

export async function answerHqQuestion(formData: FormData) {
  const actor = await requirePermission("hq.answer");
  const department = String(formData.get("department") ?? "").trim();
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  const returnTo = String(formData.get("return_to") ?? "/admin/hq/inbox");

  if (!department || !question) throw new Error("Missing question.");
  if (!answer) redirect(`${returnTo}?hqAnswerError=${encodeURIComponent("Write an answer first.")}`);
  if (!hasHqAnswerWriteSource()) redirect(`${returnTo}?hqAnswerError=${encodeURIComponent("HQ_DASHBOARD_GITHUB_WRITE_TOKEN is not set up yet.")}`);

  try {
    await submitPendingHqAnswer({ department, question, answer, answeredBy: actorOf(actor).label });
  } catch (error) {
    redirect(`${returnTo}?hqAnswerError=${encodeURIComponent(error instanceof Error ? error.message : "Could not stage that answer.")}`);
  }

  await recordAudit(actorOf(actor), {
    action: "hq.answer",
    summary: `Answered a ${department} question from /admin/hq`,
    targetType: "hq_question",
    targetId: department,
    details: { department, question },
  });

  revalidatePath("/admin/hq");
  revalidatePath("/admin/hq/inbox");
  revalidatePath(`/admin/hq/departments/${department}`);
  redirect(`${returnTo}?hqAnswerStaged=1`);
}
