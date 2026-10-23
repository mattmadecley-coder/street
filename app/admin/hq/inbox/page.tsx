import { redirect } from "next/navigation";
import styles from "@/app/admin/admin.module.css";
import { Badge, EmptyState, PageHeader, Tabs } from "@/components/admin/ui";
import { requireUser } from "@/lib/admin-guard";
import { can } from "@/lib/admin-permissions";
import { getAdminTimeZone } from "@/lib/admin-timezone";
import { OFFICE_TABS, loadHqQuestions, questionTone, type HqQuestionStatus } from "@/lib/admin-hq";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox" };

const STATUSES: Array<{ value: HqQuestionStatus | ""; label: string }> = [
  { value: "open", label: "Open" },
  { value: "answered", label: "Answered" },
  { value: "", label: "All" },
];

export default async function HqInboxPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const principal = await requireUser();
  if (!can(principal.role, "hq.view")) redirect("/admin/forbidden?needs=hq.view");

  const { status: statusParam } = await searchParams;
  const status = STATUSES.some((item) => item.value === statusParam) ? (statusParam as HqQuestionStatus | "") : "open";

  const [{ questions }, timeZone] = await Promise.all([loadHqQuestions(status), getAdminTimeZone()]);
  const stamp = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div>
      <PageHeader
        title="Inbox"
        subtitle="Every department's questions for Matthew, across the whole business. Still answered by editing that department's questions.md (or in chat) — this page doesn't take answers yet."
      />
      <Tabs label="Office sections" active="/admin/hq/inbox" tabs={OFFICE_TABS} />

      <form className={styles.searchBar} action="/admin/hq/inbox">
        <select name="status" defaultValue={status} aria-label="Question status">
          {STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <button type="submit">Filter</button>
      </form>

      {questions.length === 0 ? (
        <EmptyState title="Nothing here">{status === "open" ? "No open questions right now." : "No questions match this filter."}</EmptyState>
      ) : (
        <div className={styles.rowList}>
          {questions.map((question) => (
            <details key={question.id} className={styles.row}>
              <summary className={styles.rowSummary}>
                <span>
                  <strong>{question.question}</strong>
                  <span className={`${styles.rowMeta} u-block`}>
                    <Badge>{question.department}</Badge> · {stamp.format(new Date(question.created_at))}
                  </span>
                </span>
                <Badge tone={questionTone(question.status)}>{question.status}</Badge>
              </summary>
              <div className={styles.rowBody}>
                {question.recommendation ? <p className={styles.rowMeta}>Recommendation: {question.recommendation}</p> : <p className={styles.rowMeta}>No recommendation given.</p>}
                {question.status === "answered" ? (
                  <p className={styles.rowMeta}>
                    Answer: {question.answer ?? "(logged as answered, no answer text)"}
                    {question.answered_at ? ` · ${stamp.format(new Date(question.answered_at))}` : ""}
                  </p>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
