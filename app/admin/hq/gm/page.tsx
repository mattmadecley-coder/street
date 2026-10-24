import { redirect } from "next/navigation";
import styles from "@/app/admin/admin.module.css";
import { Banner, EmptyState, PageHeader, Tabs } from "@/components/admin/ui";
import { requireUser } from "@/lib/admin-guard";
import { can } from "@/lib/admin-permissions";
import { getAdminTimeZone } from "@/lib/admin-timezone";
import { OFFICE_TABS, loadHqBriefs } from "@/lib/admin-hq";

export const dynamic = "force-dynamic";
export const metadata = { title: "GM" };

export default async function HqGmPage() {
  const principal = await requireUser();
  if (!can(principal.role, "hq.view")) redirect("/admin/forbidden?needs=hq.view");

  const [{ available, briefs }, timeZone] = await Promise.all([loadHqBriefs(), getAdminTimeZone()]);
  const dayStamp = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", year: "numeric" });

  return (
    <div>
      <PageHeader title="GM" subtitle="The General Manager's daily briefs -- the one summary that rolls up every department." />
      <Tabs label="Office sections" active="/admin/hq/gm" tabs={OFFICE_TABS} />

      {!available ? (
        <Banner tone="info">The HQ dashboard snapshot isn&apos;t available yet. Nothing to show until it&apos;s configured and the GM writes its next <code>hq/_shared/dashboard.json</code>.</Banner>
      ) : briefs.length === 0 ? (
        <EmptyState title="No briefs yet">The General Manager writes one after its first run.</EmptyState>
      ) : (
        <div className={styles.rowList}>
          {briefs.map((brief, index) => (
            <details key={brief.id} className={styles.row} open={index === 0}>
              <summary className={styles.rowSummary}>
                <strong>{dayStamp.format(new Date(`${brief.brief_date}T00:00:00`))}</strong>
              </summary>
              <div className={styles.rowBody}>
                <pre className="adm-json">{brief.content}</pre>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
