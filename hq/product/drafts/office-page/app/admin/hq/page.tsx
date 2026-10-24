import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/app/admin/admin.module.css";
import { Badge, Banner, EmptyState, PageHeader, StatTile, Tabs } from "@/components/admin/ui";
import { requireUser } from "@/lib/admin-guard";
import { can } from "@/lib/admin-permissions";
import { getAdminTimeZone } from "@/lib/admin-timezone";
import { OFFICE_TABS, loadHqSnapshot, statusTone } from "@/lib/admin-hq";

export const dynamic = "force-dynamic";
export const metadata = { title: "Office" };

export default async function HqTodayPage() {
  const principal = await requireUser();
  if (!can(principal.role, "hq.view")) redirect("/admin/forbidden?needs=hq.view");

  const [{ available, departments, openQuestions, openGoals, latestBrief }, timeZone] = await Promise.all([
    loadHqSnapshot(),
    getAdminTimeZone(),
  ]);

  const stamp = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const dayStamp = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" });
  const todayKey = new Date().toLocaleDateString("en-US", { timeZone });
  const ranToday = departments.filter((dept) => dept.last_run_at && new Date(dept.last_run_at).toLocaleDateString("en-US", { timeZone }) === todayKey).length;

  return (
    <div>
      <PageHeader
        title="Office"
        subtitle="Street HQ — where every department's run lands. Read-only: Matthew still answers questions by editing the hq/ files, or in chat."
      />
      <Tabs label="Office sections" active="/admin/hq" tabs={OFFICE_TABS} />

      {!available ? (
        <Banner tone="info">
          The HQ tables haven&apos;t synced yet, or the <code>20261023_hq_tables</code> migration hasn&apos;t reached this
          database. Nothing to show until the GM&apos;s nightly sync runs.
        </Banner>
      ) : (
        <>
          <div className="adm-tiles u-my-18">
            <StatTile label="Departments ran today" value={`${ranToday} / ${departments.length}`} href="/admin/hq/departments" />
            <StatTile label="Open questions" value={openQuestions.length} href="/admin/hq/inbox" />
            <StatTile label="Open goals" value={openGoals.length} />
          </div>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2>GM daily brief</h2>
              <Link href="/admin/hq/gm" className={styles.buttonSecondary}>All briefs</Link>
            </div>
            {latestBrief ? (
              <div className={styles.row}>
                <div className={`${styles.rowSummary} ${styles.rowSummaryStatic}`}>
                  <span className={styles.rowMeta}>{dayStamp.format(new Date(`${latestBrief.brief_date}T00:00:00`))}</span>
                </div>
                <div className={`${styles.rowBody} ${styles.rowBodyFlush}`}>
                  <pre className="adm-json">{latestBrief.content}</pre>
                </div>
              </div>
            ) : (
              <EmptyState title="No GM brief yet">The General Manager writes one after its first run.</EmptyState>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2>Open questions</h2>
              <Link href="/admin/hq/inbox" className={styles.buttonSecondary}>Inbox</Link>
            </div>
            {openQuestions.length === 0 ? (
              <EmptyState title="Inbox is empty">Nothing waiting on Matthew right now.</EmptyState>
            ) : (
              <div className={styles.rowList}>
                {openQuestions.slice(0, 5).map((question) => (
                  <details key={question.id} className={styles.row}>
                    <summary className={styles.rowSummary}>
                      <span>
                        <strong>{question.question}</strong>
                        <span className={`${styles.rowMeta} u-block`}>{question.department} · {stamp.format(new Date(question.created_at))}</span>
                      </span>
                      <Badge tone="warn">open</Badge>
                    </summary>
                    <div className={styles.rowBody}>
                      {question.recommendation ? <p className={styles.rowMeta}>Recommendation: {question.recommendation}</p> : <p className={styles.rowMeta}>No recommendation given.</p>}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2>Departments</h2>
              <Link href="/admin/hq/departments" className={styles.buttonSecondary}>All departments</Link>
            </div>
            <div className={styles.rowList}>
              {departments.map((dept) => (
                <div key={dept.id} className={styles.row}>
                  <div className={`${styles.rowSummary} ${styles.rowSummaryStatic}`}>
                    <span>
                      <strong>{dept.display_name}</strong>
                      <span className={`${styles.rowMeta} u-block`}>
                        {dept.last_run_at ? `Last ran ${stamp.format(new Date(dept.last_run_at))}` : "Never run yet"}
                      </span>
                    </span>
                    <span className="u-row-12">
                      {dept.last_status ? <Badge tone={statusTone(dept.last_status)}>{dept.last_status}</Badge> : null}
                      <Link href={`/admin/hq/departments/${dept.id}`} className={styles.buttonSecondary}>Open</Link>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
