import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { EmailTabs } from "@/components/admin/email-tabs";
import { supabaseRest } from "@/lib/supabase-rest";
import { reportsConfig } from "@/lib/brand-report";

export const dynamic = "force-dynamic";

type ContactLite = {
  status: string; phone: string | null; source: string | null; device_type: string | null;
  emails_sent: number; open_count: number; click_count: number; created_at: string;
};
type PopupEvent = { type: string; created_at: string };

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "-");

function countBy<T>(rows: T[], pick: (row: T) => string) {
  const map = new Map<string, number>();
  for (const row of rows) map.set(pick(row), (map.get(pick(row)) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export default async function AdminEmailOverviewPage() {
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [contacts, popup, brandEmails] = await Promise.all([
    supabaseRest<ContactLite[]>("email_contacts?select=status,phone,source,device_type,emails_sent,open_count,click_count,created_at&order=created_at.desc&limit=10000", { noStore: true }).catch(() => []),
    supabaseRest<PopupEvent[]>(`email_popup_events?select=type,created_at&created_at=gte.${since30}&limit=20000`, { noStore: true }).catch(() => []),
    supabaseRest<{ status: string; open_count: number; first_clicked_at: string | null }[]>("brand_report_emails?select=status,open_count,first_clicked_at&status=eq.sent&limit=5000", { noStore: true }).catch(() => []),
  ]);
  const config = reportsConfig();

  const day = 86_400_000;
  const now = Date.now();
  const subscribed = contacts.filter((c) => c.status === "subscribed");
  const withPhone = contacts.filter((c) => c.phone).length;
  const new7 = contacts.filter((c) => now - Date.parse(c.created_at) < 7 * day).length;
  const new30 = contacts.filter((c) => now - Date.parse(c.created_at) < 30 * day).length;
  const emailed = contacts.filter((c) => c.emails_sent > 0);
  const opened = emailed.filter((c) => c.open_count > 0).length;
  const clicked = emailed.filter((c) => c.click_count > 0).length;

  const popupCount = (type: string) => popup.filter((e) => e.type === type).length;
  const shown = popupCount("shown");
  const emailSubmitted = popupCount("email_submitted");
  const phoneSubmitted = popupCount("phone_submitted");

  // Daily signups for the last 30 days.
  const buckets: { label: string; n: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * day);
    const key = d.toISOString().slice(0, 10);
    buckets.push({ label: key, n: contacts.filter((c) => c.created_at.slice(0, 10) === key).length });
  }
  const max = Math.max(1, ...buckets.map((b) => b.n));

  const brandSent = brandEmails.length;
  const brandOpened = brandEmails.filter((e) => e.open_count > 0).length;
  const brandClicked = brandEmails.filter((e) => e.first_clicked_at).length;

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/email" />
      <h1 className={styles.title}>Email</h1>
      <EmailTabs active="/admin/email" />
      <p className={styles.subtitle}>
        Two audiences: <strong>customers</strong> who sign up on the site, and <strong>brands</strong> we email their daily reports. Sending from <strong>{config.from}</strong>.
      </p>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><h2>Customers</h2><p className={styles.rowMeta}>People who gave us their email on the site.</p></div></div>
        <div className={styles.cardGrid}>
          <div className={styles.statCard}><strong>{contacts.length}</strong><span>Total signups</span></div>
          <div className={styles.statCard}><strong>{subscribed.length}</strong><span>Subscribed</span></div>
          <div className={styles.statCard}><strong>{new7}</strong><span>New, 7 days</span></div>
          <div className={styles.statCard}><strong>{new30}</strong><span>New, 30 days</span></div>
          <div className={styles.statCard}><strong>{withPhone}</strong><span>With phone ({pct(withPhone, contacts.length)})</span></div>
          <div className={styles.statCard}><strong>{contacts.filter((c) => c.status === "unsubscribed").length}</strong><span>Unsubscribed</span></div>
          <div className={styles.statCard}><strong>{pct(opened, emailed.length)}</strong><span>Opened an email</span></div>
          <div className={styles.statCard}><strong>{pct(clicked, emailed.length)}</strong><span>Clicked an email</span></div>
        </div>
        <h3 style={{ fontSize: 13, margin: "0 0 10px" }}>Signups per day, last 30 days</h3>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 90 }} role="img" aria-label="Signups per day">
          {buckets.map((b) => (
            <div key={b.label} title={`${b.label}: ${b.n}`} style={{ flex: 1, height: `${Math.max(3, (b.n / max) * 100)}%`, background: b.n ? "#101010" : "rgba(16,16,16,.12)" }} />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><h2>Signup popup, last 30 days</h2><p className={styles.rowMeta}>Who saw it, who gave an email, who added a phone. <a href="/admin/email/analytics">Full popup analytics</a></p></div></div>
        <table className={styles.table}>
          <thead><tr><th>Step</th><th>People</th><th>Rate</th></tr></thead>
          <tbody>
            <tr><td>Popup shown</td><td>{shown}</td><td>-</td></tr>
            <tr><td>Closed without email</td><td>{popupCount("closed") + popupCount("closed_email_step")}</td><td>{pct(popupCount("closed") + popupCount("closed_email_step"), shown)}</td></tr>
            <tr><td>Gave an email</td><td>{emailSubmitted}</td><td>{pct(emailSubmitted, shown)} of shown</td></tr>
            <tr><td>Added a phone</td><td>{phoneSubmitted}</td><td>{pct(phoneSubmitted, emailSubmitted)} of emails</td></tr>
            <tr><td>Skipped phone</td><td>{popupCount("skipped_phone")}</td><td>{pct(popupCount("skipped_phone"), emailSubmitted)} of emails</td></tr>
          </tbody>
        </table>
        <div style={{ display: "flex", gap: 40, flexWrap: "wrap", marginTop: 20 }}>
          <div>
            <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Signups by device</h3>
            <table className={styles.table}><tbody>{countBy(contacts, (c) => c.device_type ?? "unknown").map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
          </div>
          <div>
            <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Signups by source</h3>
            <table className={styles.table}><tbody>{countBy(contacts, (c) => c.source ?? "unknown").map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><h2>Brand outreach</h2><p className={styles.rowMeta}>Daily performance reports emailed to brands. <a href="/admin/reports">Open brand outreach</a></p></div></div>
        <div className={styles.cardGrid}>
          <div className={styles.statCard}><strong>{brandSent}</strong><span>Reports sent</span></div>
          <div className={styles.statCard}><strong>{pct(brandOpened, brandSent)}</strong><span>Opened</span></div>
          <div className={styles.statCard}><strong>{pct(brandClicked, brandSent)}</strong><span>Clicked</span></div>
        </div>
      </section>
    </div>
  );
}
