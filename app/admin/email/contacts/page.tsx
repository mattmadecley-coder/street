import Link from "next/link";
import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { EmailTabs } from "@/components/admin/email-tabs";
import { supabaseRestPage } from "@/lib/supabase-rest";
import type { EmailContact } from "@/lib/email-marketing";
import { requireUser } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function AdminEmailContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const params = await searchParams;
  const q = (params.q ?? "").trim().replace(/[^a-zA-Z0-9@._+-]/g, "");
  const page = Math.max(1, Number(params.page) || 1);
  const status = ["subscribed", "unsubscribed", "bounced", "complained"].includes(params.status ?? "") ? params.status : "";
  const filters = [q ? `email=ilike.*${q}*` : "", status ? `status=eq.${status}` : "", params.phone === "1" ? "phone=not.is.null" : ""].filter(Boolean).join("&");
  const { data, total } = await supabaseRestPage<EmailContact>(
    `email_contacts?select=*&order=created_at.desc${filters ? `&${filters}` : ""}`,
    { from: (page - 1) * PAGE, to: page * PAGE - 1 },
    { noStore: true },
  ).catch(() => ({ data: [] as EmailContact[], total: 0 }));
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (status) u.set("status", status);
    if (params.phone === "1") u.set("phone", "1");
    u.set("page", String(p));
    return `/admin/email/contacts?${u.toString()}`;
  };
  const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "-");

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/email" />
      <h1 className={styles.title}>Email</h1>
      <EmailTabs active="/admin/email/contacts" />
      <form className={styles.searchBar} style={{ maxWidth: 720 }}>
        <input name="q" defaultValue={q} placeholder="Search by email" aria-label="Search by email" />
        <select name="status" defaultValue={status} aria-label="Status" style={{ height: 42, border: "1px solid rgba(16,16,16,.25)", padding: "0 8px" }}>
          <option value="">All statuses</option><option value="subscribed">Subscribed</option><option value="unsubscribed">Unsubscribed</option><option value="bounced">Bounced</option><option value="complained">Complained</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, whiteSpace: "nowrap" }}><input type="checkbox" name="phone" value="1" defaultChecked={params.phone === "1"} /> Has phone</label>
        <button type="submit">Filter</button>
      </form>
      <p className={styles.rowMeta}>{total} customer{total === 1 ? "" : "s"}</p>
      {data.length === 0 ? <p className={styles.rowMeta}>No customers yet. They appear here the moment someone enters an email in the popup.</p> : (
        <table className={styles.table}>
          <thead><tr><th>Email</th><th>Phone</th><th>Status</th><th>Joined</th><th>Source</th><th>Sent</th><th>Opens</th><th>Clicks</th></tr></thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/admin/email/contacts/${c.id}`}>{c.email}</Link></td>
                <td>{c.phone ?? "-"}</td>
                <td><span className={c.status === "subscribed" ? styles.pill : styles.pillAlert}>{c.status}</span></td>
                <td>{fmt(c.created_at)}</td>
                <td>{c.source ?? "-"}{c.device_type ? ` / ${c.device_type}` : ""}</td>
                <td>{c.emails_sent}</td><td>{c.open_count}</td><td>{c.click_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pages > 1 ? (
        <p className={styles.rowMeta} style={{ marginTop: 14 }}>
          {page > 1 ? <Link href={qs(page - 1)}>Previous</Link> : null} Page {page} of {pages} {page < pages ? <Link href={qs(page + 1)}>Next</Link> : null}
        </p>
      ) : null}
    </div>
  );
}
