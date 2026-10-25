import { notFound, redirect } from "next/navigation";
import styles from "@/app/admin/admin.module.css";
import { Badge, Banner, EmptyState, PageHeader } from "@/components/admin/ui";
import { getPrincipal, requireUser } from "@/lib/admin-guard";
import { can } from "@/lib/admin-permissions";
import { getAdminTimeZone } from "@/lib/admin-timezone";
import { goalTone, loadHqDepartment, questionTone, statusTone } from "@/lib/admin-hq";
import { answerHqQuestion } from "@/app/admin/hq/actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  // generateMetadata runs its own render pass, independent of the page body below --
  // it must repeat the same auth gate, or an unauthenticated/unauthorized request could
  // resolve a real department name into page metadata before the page body ever redirects.
  const principal = await getPrincipal();
  if (!principal || !can(principal.role, "hq.view")) return { title: "Department" };

  const { id } = await params;
  const { detail } = await loadHqDepartment(id);
  return { title: detail.department?.display_name ?? "Department" };
}

export default async function HqDepartmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hqAnswerStaged?: string; hqAnswerError?: string }>;
}) {
  const principal = await requireUser();
  if (!can(principal.role, "hq.view")) redirect("/admin/forbidden?needs=hq.view");
  const canAnswer = can(principal.role, "hq.answer");

  const { id } = await params;
  const { hqAnswerStaged, hqAnswerError } = await searchParams;
  const [{ available, detail }, timeZone] = await Promise.all([loadHqDepartment(id), getAdminTimeZone()]);

  if (available && !detail.department) return notFound();

  const stamp = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const openQuestions = detail.questions.filter((q) => q.status === "open");
  const answeredQuestions = detail.questions.filter((q) => q.status === "answered");

  return (
    <div>
      <PageHeader
        title={detail.department?.display_name ?? id}
        subtitle={detail.department?.last_run_at ? `Last ran ${stamp.format(new Date(detail.department.last_run_at))}` : "Never run yet"}
        crumbs={[{ label: "Office", href: "/admin/hq" }, { label: "Departments", href: "/admin/hq/departments" }, { label: detail.department?.display_name ?? id }]}
        actions={detail.department?.last_status ? <Badge tone={statusTone(detail.department.last_status)}>{detail.department.last_status}</Badge> : undefined}
      />
      {hqAnswerStaged ? <p className={styles.rowMeta}>Answer staged — it&apos;ll be folded into this department&apos;s questions.md on its next run.</p> : null}
      {hqAnswerError ? <p className={styles.rowMeta}>Could not stage that answer: {hqAnswerError}</p> : null}

      {!available ? (
        <Banner tone="info">The HQ dashboard snapshot isn&apos;t available yet. Nothing to show until it&apos;s configured and the GM writes its next <code>hq/_shared/dashboard.json</code>.</Banner>
      ) : (
        <>
          <section className={styles.section}>
            <div className={styles.sectionHead}><h2>Open questions ({openQuestions.length})</h2></div>
            {openQuestions.length === 0 ? (
              <EmptyState title="None open">Nothing waiting on Matthew from this department.</EmptyState>
            ) : (
              <div className={styles.rowList}>
                {openQuestions.map((question) => (
                  <details key={question.id} className={styles.row}>
                    <summary className={styles.rowSummary}>
                      <span>
                        <strong>{question.question}</strong>
                        <span className={`${styles.rowMeta} u-block`}>{stamp.format(new Date(question.created_at))}</span>
                      </span>
                      <Badge tone={questionTone(question.status)}>{question.status}</Badge>
                    </summary>
                    <div className={styles.rowBody}>
                      {question.recommendation ? <p className={styles.rowMeta}>Recommendation: {question.recommendation}</p> : <p className={styles.rowMeta}>No recommendation given.</p>}
                      {canAnswer ? (
                        <form action={answerHqQuestion} className={styles.field}>
                          <input type="hidden" name="department" value={question.department} />
                          <input type="hidden" name="question" value={question.question} />
                          <input type="hidden" name="return_to" value={`/admin/hq/departments/${id}`} />
                          <label htmlFor={`answer-${question.id}`}>Answer</label>
                          <textarea id={`answer-${question.id}`} name="answer" placeholder="Write your answer…" required />
                          <div className={styles.actions}>
                            <button type="submit" className={styles.button}>Send answer</button>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}><h2>Goals</h2></div>
            {detail.goals.length === 0 ? (
              <EmptyState title="No goals set">This department has no goals.md entries yet.</EmptyState>
            ) : (
              <div className={styles.rowList}>
                {detail.goals.map((goal) => (
                  <div key={goal.id} className={styles.row}>
                    <div className={`${styles.rowSummary} ${styles.rowSummaryStatic}`}>
                      <span>
                        <strong>{goal.goal}</strong>
                        {goal.note ? <span className={`${styles.rowMeta} u-block`}>{goal.note}</span> : null}
                      </span>
                      <Badge tone={goalTone(goal.status)}>{goal.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}><h2>Recent runs</h2></div>
            {detail.logs.length === 0 ? (
              <EmptyState title="No runs logged yet" />
            ) : (
              <div className={styles.rowList}>
                {detail.logs.map((log) => (
                  <div key={log.id} className={styles.row}>
                    <div className={`${styles.rowSummary} ${styles.rowSummaryStatic}`}>
                      <span>{log.message}</span>
                      <span className={styles.rowMeta}>{stamp.format(new Date(log.ran_at))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {answeredQuestions.length > 0 ? (
            <section className={styles.section}>
              <div className={styles.sectionHead}><h2>Answered questions ({answeredQuestions.length})</h2></div>
              <div className={styles.rowList}>
                {answeredQuestions.map((question) => (
                  <details key={question.id} className={styles.row}>
                    <summary className={styles.rowSummary}>
                      <span>
                        <strong>{question.question}</strong>
                        <span className={`${styles.rowMeta} u-block`}>{question.answered_at ? stamp.format(new Date(question.answered_at)) : ""}</span>
                      </span>
                      <Badge tone="success">answered</Badge>
                    </summary>
                    <div className={styles.rowBody}>
                      <p className={styles.rowMeta}>{question.answer ?? "(logged as answered, no answer text)"}</p>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
