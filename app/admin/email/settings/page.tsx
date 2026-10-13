import styles from "@/app/admin/admin.module.css";
import { Banner, PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/submit-button";
import { requireUser } from "@/lib/admin-guard";
import { can } from "@/lib/admin-permissions";
import { sendConfig, sendingProblems } from "@/lib/email-send";
import { SENDING_DOMAIN, loadEmailSettings, MAX_DAILY_CAP } from "@/lib/email-settings";
import { saveEmailSettingsAction } from "../campaigns/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email settings" };

export default async function EmailSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const principal = await requireUser();
  const canEdit = can(principal.role, "email.send");
  const { saved, error } = await searchParams;
  const { settings, available } = await loadEmailSettings();
  const problems = sendingProblems(sendConfig());

  return (
    <div>
      <PageHeader title="Email settings" subtitle="How customer emails are sent. These do not affect the brand outreach emails." />
      {error ? <p className={styles.noticeError} role="alert">{error}</p> : null}
      {saved ? <Banner tone="success">Saved.</Banner> : null}
      {!available ? <Banner tone="warn">Settings can be saved after the admin storage migration is applied.</Banner> : null}
      {problems.map((problem) => <Banner key={problem} tone="danger">{problem} Set it in Coolify, then redeploy.</Banner>)}

      <form action={saveEmailSettingsAction} className={styles.form} style={{ maxWidth: 560 }}>
        <div className={styles.field}><label htmlFor="from_name">From name</label><input id="from_name" name="from_name" type="text" defaultValue={settings.fromName} maxLength={60} required disabled={!canEdit} /></div>
        <div className={styles.field}>
          <label htmlFor="from_local">From address</label>
          <span className="u-row" style={{ gap: 6, alignItems: "center" }}><input id="from_local" name="from_local" type="text" defaultValue={settings.fromLocal} maxLength={40} required disabled={!canEdit} style={{ maxWidth: 160 }} /><code>@{SENDING_DOMAIN}</code></span>
          <small className={styles.rowMeta}>Customer email is sent from its own subdomain so any problem there can never hurt your brand outreach. It is set up and verified in Resend.</small>
        </div>
        <div className={styles.field}><label htmlFor="reply_to">Replies go to</label><input id="reply_to" name="reply_to" type="email" defaultValue={settings.replyTo} required disabled={!canEdit} /></div>
        <div className={styles.field}>
          <label htmlFor="daily_cap">Daily sending limit</label>
          <input id="daily_cap" name="daily_cap" type="number" min={1} max={MAX_DAILY_CAP} defaultValue={settings.dailyCap} required disabled={!canEdit} style={{ maxWidth: 160 }} />
          <small className={styles.rowMeta}>The most emails sent in any 24 hours, across all campaigns. A brand-new sending domain has no reputation, so start small (the default is 300) and raise it gradually, for example doubling every few days while open rates stay healthy. Going from zero to thousands overnight is the fastest way to land in spam. A campaign bigger than the limit simply continues the next day.</small>
        </div>
        {canEdit ? <SubmitButton pendingText="Saving…" className={styles.button}>Save settings</SubmitButton> : <p className={styles.rowMeta}>Only an admin or owner can change these.</p>}
      </form>
    </div>
  );
}
