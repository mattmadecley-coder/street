import Link from "next/link";
import styles from "@/app/admin/admin.module.css";
import { Badge, Banner, PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/submit-button";
import { requireUser } from "@/lib/admin-guard";
import { can } from "@/lib/admin-permissions";
import { listCampaigns, percent, type CampaignStatus } from "@/lib/email-campaigns";
import { supabaseRestAll } from "@/lib/supabase-rest";
import { createCampaignAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns" };

const TONE: Record<CampaignStatus, "success" | "warn" | "info" | undefined> = { draft: undefined, scheduled: "info", sending: "warn", sent: "success", canceled: undefined };
const LABEL: Record<CampaignStatus, string> = { draft: "Draft", scheduled: "Scheduled", sending: "Sending", sent: "Sent", canceled: "Canceled" };

type SendLite = { campaign_id: string; status: string; delivered_at: string | null; first_opened_at: string | null; open_count: number; click_count: number };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ deleted?: string; error?: string }> }) {
  const principal = await requireUser();
  const canWrite = can(principal.role, "email.write");
  const { deleted, error } = await searchParams;
  const { campaigns, available } = await listCampaigns();
  const sends = available && campaigns.length ? await supabaseRestAll<SendLite[]>("email_campaign_sends?select=campaign_id,status,delivered_at,first_opened_at,open_count,click_count&status=eq.sent", 1000, 200000).catch(() => []) : [];
  const byCampaign = new Map<string, { sent: number; opened: number; clicked: number }>();
  for (const send of sends) {
    const entry = byCampaign.get(send.campaign_id) ?? { sent: 0, opened: 0, clicked: 0 };
    entry.sent += 1;
    if (send.first_opened_at || send.open_count > 0 || send.click_count > 0) entry.opened += 1;
    if (send.click_count > 0) entry.clicked += 1;
    byCampaign.set(send.campaign_id, entry);
  }

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="One-off emails to a segment: pick a template and an audience, send yourself a test, then send now or schedule it."
        actions={canWrite && available ? <form action={createCampaignAction}><SubmitButton pendingText="Creating…" className={styles.button}>New campaign</SubmitButton></form> : null}
      />
      {error ? <p className={styles.noticeError} role="alert">{error}</p> : null}
      {deleted ? <Banner tone="success">Campaign deleted.</Banner> : null}
      {!available ? <Banner tone="warn">Campaigns switch on after the campaigns migration is applied (see docs/ADMIN.md).</Banner> : null}

      {campaigns.length ? (
        <section className={styles.section}>
          <table className={styles.table}>
            <thead><tr><th scope="col">Campaign</th><th scope="col">Status</th><th scope="col">Recipients</th><th scope="col">Opened</th><th scope="col">Clicked</th><th scope="col">Date</th></tr></thead>
            <tbody>
              {campaigns.map((campaign) => {
                const stats = byCampaign.get(campaign.id);
                const when = campaign.completed_at ?? campaign.started_at ?? campaign.scheduled_at ?? campaign.created_at;
                return (
                  <tr key={campaign.id}>
                    <th scope="row"><Link href={`/admin/email/campaigns/${campaign.id}`}>{campaign.name}</Link>{campaign.subject ? <span className={`${styles.rowMeta} u-block`}>{campaign.subject}</span> : null}</th>
                    <td><Badge tone={TONE[campaign.status]}>{LABEL[campaign.status]}</Badge></td>
                    <td>{campaign.recipients_total ? campaign.recipients_total.toLocaleString() : "–"}</td>
                    <td>{stats ? percent(stats.opened, stats.sent) : "–"}</td>
                    <td>{stats ? percent(stats.clicked, stats.sent) : "–"}</td>
                    <td>{new Date(when).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : available ? <p className={styles.rowMeta}>No campaigns yet.</p> : null}
    </div>
  );
}
