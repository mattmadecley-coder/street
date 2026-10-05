import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { SubmitButton } from "@/components/admin/submit-button";
import { supabaseRest } from "@/lib/supabase-rest";
import { easternYesterday, reportsConfig, type ReportRow } from "@/lib/brand-report";
import { findContactsAction, generateReportsAction, saveContactAction, sendAllDraftsAction, sendReportAction, skipReportAction } from "./actions";

export const dynamic = "force-dynamic";

type ReportWithBrand = ReportRow & { brands: { slug: string; name: string } | null };
type BrandContact = {
  id: string; slug: string; name: string; store_url: string;
  brand_contacts: { contact_email: string | null; contact_email_source: string | null; contact_email_checked_at: string | null; reports_opted_out_at: string | null } | null;
};

const STATUS_LABEL: Record<ReportRow["status"], string> = { draft: "Waiting for approval", sent: "Sent", skipped: "Skipped", failed: "Failed" };

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const config = reportsConfig();
  const [reports, brands] = await Promise.all([
    supabaseRest<ReportWithBrand[]>("brand_report_emails?select=*,brands(slug,name)&order=report_date.desc,created_at.desc&limit=60", { noStore: true }),
    supabaseRest<BrandContact[]>("brands?select=id,slug,name,store_url,brand_contacts(contact_email,contact_email_source,contact_email_checked_at,reports_opted_out_at)&is_active=eq.true&order=name.asc", { noStore: true }),
  ]);

  const byDate = new Map<string, ReportWithBrand[]>();
  for (const report of reports) byDate.set(report.report_date, [...(byDate.get(report.report_date) ?? []), report]);
  const withEmail = brands.filter((brand) => brand.brand_contacts?.contact_email).length;
  const checked = brands.filter((brand) => brand.brand_contacts?.contact_email_checked_at).length;
  const blockers = [
    !config.apiKey && "RESEND_API_KEY isn't set — nothing can send yet.",
    !config.mailingAddress && "BRAND_REPORTS_MAILING_ADDRESS isn't set — required in every email by CAN-SPAM, so sending is blocked.",
  ].filter(Boolean) as string[];

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/reports" />
      <h1 className={styles.title}>Brand reports</h1>
      <p className={styles.subtitle}>
        Every morning (~9 AM ET) Street builds a report for each brand that got outbound clicks the day before.
        {config.autoSend ? " Auto-send is ON — reports go out automatically." : " Auto-send is OFF — reports wait here for your approval."}
        {" "}From <strong>{config.from}</strong>, replies to <strong>{config.replyTo}</strong>.
      </p>

      {blockers.map((message) => <p key={message} className={styles.noticeError}>{message}</p>)}
      {params.error ? <p className={styles.noticeError}>{params.error}</p> : null}
      {params.sent ? <p className={styles.notice}>Sent {params.sent === "1" ? "the report" : `${params.sent} report(s)`}.</p> : null}
      {params.skipped ? <p className={styles.notice}>Report skipped.</p> : null}
      {params.generated ? <p className={styles.notice}>Generated {params.generated}.</p> : null}
      {params.contact ? <p className={styles.notice}>Contact saved.</p> : null}
      {params.finding ? <p className={styles.notice}>Looking up contact emails for {params.finding} brand(s) in the background — refresh in a minute or two.</p> : null}

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><h2>Build reports</h2><p className={styles.rowMeta}>Re-running a day rebuilds its drafts with fresh numbers. Already-sent reports are never touched.</p></div></div>
        <form action={generateReportsAction} className={styles.form} style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
          <div className={styles.field}><label htmlFor="date">Day (Eastern)</label><input id="date" name="date" type="date" defaultValue={easternYesterday()} /></div>
          <SubmitButton pendingText="Building…" className={styles.button}>Build reports for this day</SubmitButton>
        </form>
      </section>

      {[...byDate.entries()].map(([date, rows]) => {
        const drafts = rows.filter((row) => row.status === "draft").length;
        return (
          <section key={date} className={styles.section}>
            <div className={styles.sectionHead}>
              <div><h2>{date}</h2><p className={styles.rowMeta}>{rows.length} brand(s) · {drafts} waiting</p></div>
              {drafts ? (
                <form action={sendAllDraftsAction}><input type="hidden" name="date" value={date} />
                  <SubmitButton pendingText="Sending…" className={styles.button} disabled={blockers.length > 0}>Approve &amp; send all {drafts}</SubmitButton>
                </form>
              ) : null}
            </div>
            <div className={styles.rowList}>
              {rows.map((row) => (
                <details key={row.id} className={styles.row}>
                  <summary className={styles.rowSummary}>
                    <strong>{row.brands?.name ?? "Unknown brand"}</strong>
                    <span className={styles.pill}>{STATUS_LABEL[row.status]}</span>
                    <span className={styles.rowMeta}>{row.stats.clicks} click(s) · {row.to_email ?? "no email"}{row.is_first ? " · first email" : ""}{row.error ? ` · ${row.error}` : ""}</span>
                  </summary>
                  <div className={styles.rowBody}>
                    <p className={styles.rowMeta}>Subject: <strong>{row.subject}</strong></p>
                    <iframe title={`Preview for ${row.brands?.name}`} srcDoc={row.html} style={{ width: "100%", maxWidth: 640, height: 900, border: "1px solid rgba(16,16,16,.16)", background: "#f4f3ee" }} />
                    {row.status !== "sent" ? (
                      <div className={styles.actions} style={{ display: "flex", gap: 10, marginTop: 12 }}>
                        <form action={sendReportAction}><input type="hidden" name="id" value={row.id} />
                          <SubmitButton pendingText="Sending…" className={styles.button} disabled={blockers.length > 0 || !row.to_email}>Approve &amp; send</SubmitButton>
                        </form>
                        {row.status !== "skipped" ? (
                          <form action={skipReportAction}><input type="hidden" name="id" value={row.id} />
                            <SubmitButton pendingText="…" className={styles.buttonSecondary}>Skip</SubmitButton>
                          </form>
                        ) : null}
                      </div>
                    ) : <p className={styles.rowMeta}>Sent {row.sent_at ? new Date(row.sent_at).toLocaleString("en-US", { timeZone: "America/New_York" }) : ""} ET</p>}
                  </div>
                </details>
              ))}
            </div>
          </section>
        );
      })}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div><h2>Brand contact emails</h2><p className={styles.rowMeta}>{withEmail} of {brands.length} brands have an address · {checked} checked. Found automatically from each store&apos;s public contact/policy pages; anything you type here wins.</p></div>
          <div style={{ display: "flex", gap: 8 }}>
            <form action={findContactsAction}><SubmitButton pendingText="Starting…" className={styles.button}>Find missing emails</SubmitButton></form>
            <form action={findContactsAction}><input type="hidden" name="all" value="1" /><SubmitButton pendingText="Starting…" className={styles.buttonSecondary}>Re-check all</SubmitButton></form>
          </div>
        </div>
        <table className={styles.table}>
          <thead><tr><th>Brand</th><th>Email</th><th>Found on</th><th>Reports</th></tr></thead>
          <tbody>
            {brands.map((brand) => {
              const contact = brand.brand_contacts;
              return (
                <tr key={brand.id}>
                  <td><a href={brand.store_url} target="_blank" rel="noreferrer">{brand.name}</a></td>
                  <td>
                    <form action={saveContactAction} style={{ display: "flex", gap: 6 }}>
                      <input type="hidden" name="brand_id" value={brand.id} />
                      <input name="email" type="email" defaultValue={contact?.contact_email ?? ""} placeholder={contact?.contact_email_checked_at ? "none found" : "not checked yet"} style={{ minWidth: 220 }} />
                      <SubmitButton pendingText="…" className={styles.buttonSecondary}>Save</SubmitButton>
                    </form>
                  </td>
                  <td className={styles.rowMeta}>{contact?.contact_email_source === "manual" ? "set by you" : contact?.contact_email_source ? new URL(contact.contact_email_source).pathname : "—"}</td>
                  <td>
                    {contact?.reports_opted_out_at
                      ? <span className={styles.pillAlert} title="Opt-outs must be honored. Only re-enable in the database if the brand asks to resubscribe.">Unsubscribed</span>
                      : <span className={styles.rowMeta}>On</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
