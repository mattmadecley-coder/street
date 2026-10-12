import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { EmailTabs } from "@/components/admin/email-tabs";
import { SubmitButton } from "@/components/admin/submit-button";
import { supabaseRest } from "@/lib/supabase-rest";
import type { EmailContact } from "@/lib/email-marketing";
import { setContactStatusAction } from "../../actions";

export const dynamic = "force-dynamic";

type ContactEvent = { id: string; type: string; meta: Record<string, unknown> | null; created_at: string };
type SiteEvent = { event_type: string; path: string | null; query: string | null; brand_slug: string | null; created_at: string };

const LABEL: Record<string, string> = {
  signed_up: "Signed up", signed_up_again: "Entered email again", phone_added: "Added phone number", resubscribed: "Re-subscribed",
  unsubscribed: "Unsubscribed", sent: "Email sent", delivered: "Email delivered", opened: "Opened an email", clicked: "Clicked a link",
  bounced: "Email bounced", complained: "Marked as spam", unsubscribed_by_admin: "Unsubscribed by admin", resubscribed_by_admin: "Re-subscribed by admin",
};

export default async function AdminEmailContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const contact = (await supabaseRest<EmailContact[]>(`email_contacts?id=eq.${id}&select=*&limit=1`, { noStore: true }).catch(() => []))[0];
  if (!contact) notFound();

  const ids = (contact.anonymous_ids ?? []).filter((v) => /^[\w-]{6,80}$/.test(v));
  const [events, site] = await Promise.all([
    supabaseRest<ContactEvent[]>(`email_contact_events?contact_id=eq.${id}&select=id,type,meta,created_at&order=created_at.desc&limit=100`, { noStore: true }).catch(() => []),
    ids.length
      ? supabaseRest<SiteEvent[]>(`site_events?anonymous_user_id=in.(${ids.join(",")})&select=event_type,path,query,brand_slug,created_at&order=created_at.desc&limit=60`, { noStore: true }).catch(() => [])
      : Promise.resolve([] as SiteEvent[]),
  ]);
  const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET" : "-");
  const next = contact.status === "subscribed" ? "unsubscribed" : "subscribed";

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/email" />
      <h1 className={styles.title}>Email</h1>
      <EmailTabs active="/admin/email/contacts" />
      <p className={styles.rowMeta}><Link href="/admin/email/contacts">Back to customers</Link></p>
      <h2 style={{ margin: "6px 0 14px" }}>{contact.email}</h2>
      <div className={styles.cardGrid}>
        <div className={styles.statCard}><strong>{contact.status}</strong><span>Status</span></div>
        <div className={styles.statCard}><strong>{contact.phone ?? "none"}</strong><span>Phone</span></div>
        <div className={styles.statCard}><strong>{contact.emails_sent}</strong><span>Emails sent</span></div>
        <div className={styles.statCard}><strong>{contact.open_count}</strong><span>Opens</span></div>
        <div className={styles.statCard}><strong>{contact.click_count}</strong><span>Clicks</span></div>
      </div>
      <p className={styles.rowMeta}>
        Joined {fmt(contact.created_at)} via {contact.source ?? "unknown"}{contact.device_type ? `, ${contact.device_type}` : ""}{contact.signup_path ? ` on ${contact.signup_path}` : ""}.
        {contact.utm_source ? ` Campaign: ${contact.utm_source}${contact.utm_medium ? `/${contact.utm_medium}` : ""}${contact.utm_campaign ? `/${contact.utm_campaign}` : ""}.` : ""}
        {contact.referrer ? ` Referrer: ${contact.referrer}.` : ""} Last opened {fmt(contact.last_opened_at)}. Last clicked {fmt(contact.last_clicked_at)}.
      </p>
      <form action={setContactStatusAction} style={{ margin: "12px 0 0" }}>
        <input type="hidden" name="id" value={contact.id} /><input type="hidden" name="status" value={next} />
        <SubmitButton pendingText="Saving…" className={styles.buttonSecondary}>{next === "unsubscribed" ? "Unsubscribe this customer" : "Re-subscribe this customer"}</SubmitButton>
      </form>

      <section className={styles.section}>
        <div className={styles.sectionHead}><h2>Email activity</h2></div>
        {events.length === 0 ? <p className={styles.rowMeta}>Nothing yet.</p> : (
          <table className={styles.table}><tbody>
            {events.map((e) => <tr key={e.id}><td>{fmt(e.created_at)}</td><td>{LABEL[e.type] ?? e.type}</td><td>{typeof e.meta?.subject === "string" ? e.meta.subject : typeof e.meta?.url === "string" ? e.meta.url : ""}</td></tr>)}
          </tbody></table>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><h2>On-site activity</h2><p className={styles.rowMeta}>Recent visits tied to this browser.</p></div></div>
        {site.length === 0 ? <p className={styles.rowMeta}>No site activity linked yet.</p> : (
          <table className={styles.table}><tbody>
            {site.map((e, i) => <tr key={i}><td>{fmt(e.created_at)}</td><td>{e.event_type}</td><td>{e.query ? `"${e.query}"` : e.brand_slug ?? e.path ?? ""}</td></tr>)}
          </tbody></table>
        )}
      </section>
    </div>
  );
}
