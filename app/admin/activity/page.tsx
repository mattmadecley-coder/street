import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/app/admin/admin.module.css";
import { Badge, Banner, EmptyState, PageHeader } from "@/components/admin/ui";
import { requireUser } from "@/lib/admin-guard";
import { can } from "@/lib/admin-permissions";
import { isMissingTableError } from "@/lib/admin-state";
import { getAdminTimeZone } from "@/lib/admin-timezone";
import { hasSupabaseCatalog, supabaseRestPage } from "@/lib/supabase-rest";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity" };

const PAGE_SIZE = 50;

type AuditRow = {
  id: number;
  at: string;
  actor_label: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  summary: string;
  details: Record<string, unknown> | null;
};

const GROUPS: Array<{ value: string; label: string }> = [
  { value: "", label: "All activity" },
  { value: "auth.", label: "Sign-ins" },
  { value: "team.", label: "Team changes" },
  { value: "account.", label: "Account changes" },
  { value: "product.", label: "Products" },
  { value: "brand.", label: "Brands" },
  { value: "collection.", label: "Collections" },
  { value: "homepage.", label: "Homepage" },
  { value: "report.", label: "Brand reports" },
  { value: "settings.", label: "Settings" },
  { value: "analytics.", label: "Analytics" },
];

/** Escapes characters that mean something in a PostgREST filter value. */
function filterValue(text: string) {
  return encodeURIComponent(text.replace(/[*,()%\\]/g, " ").trim().slice(0, 80));
}

function href(group: string, q: string, page: number) {
  const params = new URLSearchParams();
  if (group) params.set("group", group);
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const text = params.toString();
  return text ? `/admin/activity?${text}` : "/admin/activity";
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ group?: string; q?: string; page?: string }> }) {
  const principal = await requireUser();
  if (!can(principal.role, "audit.view")) redirect("/admin/forbidden?needs=audit.view");

  const { group = "", q = "", page: pageParam } = await searchParams;
  const safeGroup = GROUPS.some((item) => item.value === group) ? group : "";
  const page = Math.max(1, Math.floor(Number(pageParam) || 1));
  const timeZone = await getAdminTimeZone();

  let rows: AuditRow[] = [];
  let total = 0;
  let unavailable = false;
  if (!hasSupabaseCatalog()) unavailable = true;
  else {
    const filters = [
      safeGroup ? `action=like.${encodeURIComponent(`${safeGroup}*`)}` : "",
      q.trim() ? `or=(summary.ilike.*${filterValue(q)}*,actor_label.ilike.*${filterValue(q)}*)` : "",
    ].filter(Boolean).join("&");
    try {
      const from = (page - 1) * PAGE_SIZE;
      const result = await supabaseRestPage<AuditRow>(`audit_log?select=id,at,actor_label,action,target_type,target_id,summary,details&order=at.desc,id.desc${filters ? `&${filters}` : ""}`, { from, to: from + PAGE_SIZE - 1 }, { noStore: true });
      rows = result.data;
      total = result.total;
    } catch (error) {
      if (isMissingTableError(error)) unavailable = true;
      else throw error;
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const stamp = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div>
      <PageHeader title="Activity" subtitle="Who did what, and when. Entries cannot be edited or deleted." />
      {unavailable ? <Banner tone="info">The activity log switches on after the <code>20261015_admin_accounts</code> database migration is applied. Nothing is recorded until then.</Banner> : null}

      <form className={styles.searchBar} action="/admin/activity">
        <select name="group" defaultValue={safeGroup} aria-label="Type of activity">
          {GROUPS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <input type="text" name="q" defaultValue={q} placeholder="Search by person or description…" aria-label="Search activity" />
        <button type="submit">Filter</button>
      </form>

      {rows.length === 0 && !unavailable ? (
        <EmptyState title="No activity found">{safeGroup || q ? "Try a different filter." : "Actions taken in the admin will appear here."}</EmptyState>
      ) : (
        <>
          <p className={`${styles.rowMeta} u-mb-14`}>{total.toLocaleString()} entr{total === 1 ? "y" : "ies"} · times in {timeZone}</p>
          <div className={styles.rowList}>
            {rows.map((row) => (
              <details key={row.id} className={styles.row}>
                <summary className={styles.rowSummary}>
                  <span><strong>{row.summary || row.action}</strong><span className={`${styles.rowMeta} u-block`}>{row.actor_label} · {stamp.format(new Date(row.at))}</span></span>
                  <Badge>{row.action}</Badge>
                </summary>
                <div className={styles.rowBody}>
                  {row.target_type ? <p className={styles.rowMeta}>Target: {row.target_type}{row.target_id ? ` · ${row.target_id}` : ""}</p> : null}
                  {row.details && Object.keys(row.details).length ? <pre className="adm-json">{JSON.stringify(row.details, null, 2)}</pre> : <p className={styles.rowMeta}>No extra details.</p>}
                </div>
              </details>
            ))}
          </div>
          {totalPages > 1 ? (
            <nav className={styles.pager} aria-label="Activity pages">
              {page > 1 ? <Link href={href(safeGroup, q, page - 1)} className={styles.buttonSecondary}>← Newer</Link> : <span />}
              <span>Page {page} of {totalPages}</span>
              {page < totalPages ? <Link href={href(safeGroup, q, page + 1)} className={styles.buttonSecondary}>Older →</Link> : <span />}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
