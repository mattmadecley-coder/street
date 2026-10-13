import { redirect } from "next/navigation";
import styles from "@/app/admin/admin.module.css";
import { requireUser } from "@/lib/admin-guard";
import { can } from "@/lib/admin-permissions";
import { Banner, PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/submit-button";
import { COMMON_TIME_ZONES, getAdminTimeZone } from "@/lib/admin-timezone";
import { readAdminState } from "@/lib/admin-state";
import { THRESHOLD_FIELDS, normalizeThresholds } from "@/lib/alert-thresholds";
import { timeZoneLabel } from "@/lib/date-range";
import { resetThresholds, saveThresholds, saveTimeZone } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const principal = await requireUser();
  if (!can(principal.role, "settings.write")) redirect("/admin/forbidden?needs=settings.write");
  const { error } = await searchParams;
  const [timeZone, thresholdState] = await Promise.all([getAdminTimeZone(), readAdminState<unknown>("alert_thresholds", {})]);
  const thresholds = normalizeThresholds(thresholdState.value);
  const options = COMMON_TIME_ZONES.some((zone) => zone.value === timeZone) ? COMMON_TIME_ZONES : [{ value: timeZone, label: timeZone }, ...COMMON_TIME_ZONES];
  const now = new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date());

  return (
    <div>
      <PageHeader title="Settings" subtitle="Store-wide preferences for the admin." />
      {error ? <p className={styles.noticeError}>{error}</p> : null}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2>Reporting time zone</h2>
            <p className={styles.rowMeta}>Decides where a day starts and ends in the date-range picker, Home and Analytics. Right now it is {now} in {timeZoneLabel(timeZone)}.</p>
          </div>
        </div>
        <form action={saveTimeZone} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="time_zone">Time zone</label>
            <select id="time_zone" name="time_zone" defaultValue={timeZone}>
              {options.map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}
            </select>
          </div>
          <p className={styles.rowMeta}>Brand report emails, the homepage feature schedule and the Social dashboard still use Eastern Time.</p>
          <SubmitButton pendingText="Saving…" className={styles.button}>Save time zone</SubmitButton>
        </form>
      </section>

      <section className={styles.section} id="alert-thresholds">
        <div className={styles.sectionHead}>
          <div>
            <h2>Alert thresholds</h2>
            <p className={styles.rowMeta}>When each alert fires. Traffic and click comparisons look at the last 7 complete days against the 7 before.</p>
          </div>
        </div>
        {!thresholdState.available ? (
          <Banner tone="info">Editing thresholds switches on after the <code>20261014_admin_state</code> database migration is applied. The values below are the defaults the alerts use today.</Banner>
        ) : null}
        <form action={saveThresholds} className={`${styles.form} adm-threshold-form`}>
          {THRESHOLD_FIELDS.map((field) => (
            <div key={field.key} className={styles.field}>
              <label htmlFor={`t-${field.key}`}>{field.label}</label>
              <div className="adm-input-unit">
                <input id={`t-${field.key}`} name={field.key} type="number" inputMode="decimal" step="any" min={field.min} max={field.max} defaultValue={thresholds[field.key]} disabled={!thresholdState.available} required />
                <span>{field.unit}</span>
              </div>
              <span className={styles.rowMeta}>{field.help}</span>
            </div>
          ))}
          <div className={styles.actions}>
            <SubmitButton pendingText="Saving…" className={styles.button} disabled={!thresholdState.available}>Save thresholds</SubmitButton>
          </div>
        </form>
        <form action={resetThresholds} className="u-mt-10">
          <SubmitButton pendingText="Resetting…" className={styles.buttonSecondary} disabled={!thresholdState.available}>Reset to defaults</SubmitButton>
        </form>
      </section>
    </div>
  );
}
