import Link from "next/link";
import styles from "@/app/admin/admin.module.css";
import { AnalyticsNav } from "@/components/admin/analytics-nav";
import { Banner, EmptyState, PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/submit-button";
import { loadAlertView } from "@/lib/admin-alerts";
import { SNOOZE_CHOICES } from "@/lib/alert-states";
import { acknowledgeAlert, restoreAlert, snoozeAlert } from "./actions";
import { requireUser } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alerts" };

const ICON = { critical: "!", warning: "!", info: "i" } as const;

function untilLabel(until: string | null) {
  if (!until) return "";
  return new Date(until).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function AnalyticsAlertsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser();
  const { error } = await searchParams;
  const view = await loadAlertView();
  const criticalCount = view.active.filter((alert) => alert.severity === "critical").length;
  const warningCount = view.active.filter((alert) => alert.severity === "warning").length;

  return (
    <div>
      <AnalyticsNav active="/admin/analytics/alerts" alertCount={view.active.length} />
      <PageHeader
        title="Alerts"
        subtitle="Rules check tracking freshness, catalog health and the last 7 complete days against the 7 before. Today is excluded because it is still in progress."
        actions={<Link href="/admin/settings#alert-thresholds" className="adm-btn" data-variant="secondary" data-size="sm">Edit thresholds</Link>}
      />
      {error ? <p className={styles.noticeError}>{error}</p> : null}
      {!view.statesAvailable ? (
        <Banner tone="info">Acknowledge, snooze and editable thresholds switch on after the <code>20261014_admin_state</code> database migration is applied. Until then alerts use the default thresholds.</Banner>
      ) : null}

      {view.active.length > 0 ? (
        <div className={styles.alertSummary}>
          {criticalCount > 0 ? <span className={`${styles.pill} ${styles.pillAlert}`}>{criticalCount} critical</span> : null}
          {warningCount > 0 ? <span className={styles.pill}>{warningCount} warning{warningCount === 1 ? "" : "s"}</span> : null}
        </div>
      ) : null}

      {view.active.length === 0 ? (
        <div className="u-mt-18">
          <EmptyState title="All clear">
            {view.silenced.length ? `${view.silenced.length} alert${view.silenced.length === 1 ? " is" : "s are"} acknowledged or snoozed below.` : "Traffic, tracking freshness, conversion, broken images, sync freshness and error counts are all within your thresholds."}
          </EmptyState>
        </div>
      ) : (
        <ul className={styles.alertList}>
          {view.active.map((alert) => (
            <li key={alert.key} className={styles.alertCard} data-severity={alert.severity}>
              <span className={styles.alertIcon} aria-hidden="true">{ICON[alert.severity]}</span>
              <p className={styles.alertSeverity}>{alert.severity}</p>
              <h2 className={styles.alertTitle}>{alert.title}</h2>
              <p className={styles.alertDetail}>{alert.detail}</p>
              <div className={`${styles.alertAction} u-row`}>
                {alert.href ? <Link href={alert.href} className="adm-btn" data-variant="secondary" data-size="sm">{alert.action ?? "View"}</Link> : null}
                {view.statesAvailable ? (
                  <>
                    <form action={acknowledgeAlert}>
                      <input type="hidden" name="key" value={alert.key} />
                      <input type="hidden" name="severity" value={alert.severity} />
                      <SubmitButton pendingText="…" className="adm-btn" data-variant="ghost" data-size="sm">Acknowledge</SubmitButton>
                    </form>
                    {SNOOZE_CHOICES.map((choice) => (
                      <form key={choice.days} action={snoozeAlert}>
                        <input type="hidden" name="key" value={alert.key} />
                        <input type="hidden" name="severity" value={alert.severity} />
                        <input type="hidden" name="days" value={choice.days} />
                        <SubmitButton pendingText="…" className="adm-btn" data-variant="ghost" data-size="sm">{choice.label}</SubmitButton>
                      </form>
                    ))}
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {view.silenced.length > 0 ? (
        <section className={styles.section} aria-label="Acknowledged and snoozed alerts">
          <div className={styles.sectionHead}><h2>Acknowledged and snoozed</h2></div>
          <ul className="adm-attention">
            {view.silenced.map(({ alert, state }) => (
              <li key={alert.key} data-tone="info">
                <div>
                  <strong>{alert.title}</strong>
                  <p>{state.status === "snoozed" ? `Snoozed until ${untilLabel(state.until)}` : "Acknowledged. It comes back if it gets more severe."}</p>
                </div>
                <form action={restoreAlert}>
                  <input type="hidden" name="key" value={alert.key} />
                  <SubmitButton pendingText="…" className="adm-btn" data-variant="secondary" data-size="sm">Restore</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
