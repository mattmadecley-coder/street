import Link from "next/link";
import styles from "@/app/admin/admin.module.css";
import { Banner, PageHeader } from "@/components/admin/ui";
import { requireUser } from "@/lib/admin-guard";
import { can } from "@/lib/admin-permissions";
import { describeDefinition, listSegments, loadContactsForSegments, summarizeSegment, SEGMENT_PRESETS } from "@/lib/email-segments";

export const dynamic = "force-dynamic";
export const metadata = { title: "Segments" };

export default async function SegmentsPage({ searchParams }: { searchParams: Promise<{ deleted?: string; error?: string }> }) {
  const principal = await requireUser();
  const canWrite = can(principal.role, "email.write");
  const { deleted, error } = await searchParams;
  const [{ segments, available }, { contacts, truncated }] = await Promise.all([listSegments(), loadContactsForSegments()]);
  const now = Date.now();

  return (
    <div>
      <PageHeader
        title="Segments"
        subtitle="Saved groups of customers, like “opened in the last 30 days” or “signed up from TikTok”. Use a segment as the audience for a campaign or sequence."
        actions={canWrite ? <Link href="/admin/email/segments/new" className={styles.button}>New segment</Link> : null}
      />
      {error ? <p className={styles.noticeError} role="alert">{error}</p> : null}
      {deleted ? <Banner tone="success">Segment deleted.</Banner> : null}
      {!available ? <Banner tone="warn">Segments switch on after the email platform migration is applied (see docs/ADMIN.md).</Banner> : null}
      {truncated ? <Banner tone="warn">There are more contacts than can be counted at once, so counts here may be low.</Banner> : null}

      <section className={styles.section}>
        {segments.length ? (
          <table className={styles.table}>
            <thead><tr><th scope="col">Segment</th><th scope="col">Rules</th><th scope="col">People you can email</th></tr></thead>
            <tbody>
              {segments.map((segment) => {
                const summary = summarizeSegment(segment.definition, contacts, now, 0);
                return (
                  <tr key={segment.id}>
                    <th scope="row"><Link href={`/admin/email/segments/${segment.id}`}>{segment.name}</Link>{segment.description ? <span className={`${styles.rowMeta} u-block`}>{segment.description}</span> : null}</th>
                    <td>{describeDefinition(segment.definition)}</td>
                    <td>{summary.sendable.toLocaleString()}{summary.total !== summary.sendable ? <span className={styles.rowMeta}> ({summary.total.toLocaleString()} match)</span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : available ? <p className={styles.rowMeta}>No segments yet. Start from one of the ready-made ones below, or build your own.</p> : null}
      </section>

      {canWrite && available ? (
        <section className={styles.section}>
          <div className={styles.sectionHead}><h2>Start from a ready-made segment</h2></div>
          <div className="u-cards-300">
            {SEGMENT_PRESETS.map((preset) => {
              const summary = summarizeSegment(preset.definition, contacts, now, 0);
              return (
                <Link key={preset.key} href={`/admin/email/segments/new?preset=${preset.key}`} className="adm-card" style={{ textDecoration: "none", color: "inherit" }}>
                  <div className="adm-card-head"><h3>{preset.name}</h3></div>
                  <p className={styles.rowMeta}>{preset.description}</p>
                  <p style={{ margin: "8px 0 0", fontWeight: 700 }}>{summary.sendable.toLocaleString()} people</p>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
