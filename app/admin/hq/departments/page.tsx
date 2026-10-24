import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/app/admin/admin.module.css";
import { Badge, Banner, PageHeader, Tabs } from "@/components/admin/ui";
import { requireUser } from "@/lib/admin-guard";
import { can } from "@/lib/admin-permissions";
import { getAdminTimeZone } from "@/lib/admin-timezone";
import { OFFICE_TABS, loadHqDepartments, statusTone } from "@/lib/admin-hq";

export const dynamic = "force-dynamic";
export const metadata = { title: "Departments" };

export default async function HqDepartmentsPage() {
  const principal = await requireUser();
  if (!can(principal.role, "hq.view")) redirect("/admin/forbidden?needs=hq.view");

  const [{ available, departments }, timeZone] = await Promise.all([loadHqDepartments(), getAdminTimeZone()]);
  const stamp = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div>
      <PageHeader title="Departments" subtitle="Every Street HQ department and when it last ran." />
      <Tabs label="Office sections" active="/admin/hq/departments" tabs={OFFICE_TABS} />

      {!available ? (
        <Banner tone="info">The HQ dashboard snapshot isn&apos;t available yet. Nothing to show until it&apos;s configured and the GM writes its next <code>hq/_shared/dashboard.json</code>.</Banner>
      ) : (
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
      )}
    </div>
  );
}
