import Link from "next/link";
import styles from "@/app/admin/admin.module.css";
import fitStyles from "./fit-wars-admin.module.css";
import { Banner, Badge, PageHeader } from "@/components/admin/ui";
import { requireUser } from "@/lib/admin-guard";
import { supabaseRest, supabaseRestPage } from "@/lib/supabase-rest";
import { createCampaign } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fit Wars" };

type Campaign = { id: string; school_name: string; code: string; label: string; status: string; audience_type: string; updated_at: string };

async function count(path: string) {
  try { return (await supabaseRestPage<{ id: string }>(path, { from: 0, to: 0 }, { noStore: true })).total; } catch { return 0; }
}

export default async function FitWarsIndex({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const principal = await requireUser();
  const params = await searchParams;
  let campaigns: Campaign[] = [];
  let loadError = "";
  try { campaigns = await supabaseRest<Campaign[]>("fit_wars_campaigns?select=id,school_name,code,label,status,audience_type,updated_at&order=updated_at.desc", { noStore: true }); } catch { loadError = "Fit Wars is not connected to the database yet. Apply the 20261028_fit_wars.sql migration, then refresh this page."; }
  const stats = await Promise.all(campaigns.map(async (campaign) => ({ id: campaign.id, votes: await count(`fit_wars_votes?campaign_id=eq.${campaign.id}&select=id`), visitors: await count(`fit_wars_events?campaign_id=eq.${campaign.id}&event_type=eq.landing&select=id`) })));
  const statsById = new Map(stats.map((stat) => [stat.id, stat]));
  const canWrite = principal.role !== "analyst";

  return (
    <div>
      <PageHeader title="Fit Wars" subtitle="Launch school-specific outfit voting campaigns, manage submissions, and watch the leaderboard convert into Street discovery." actions={<a href="/f/mc" target="_blank" rel="noreferrer" className="adm-btn" data-variant="secondary">Open demo ↗</a>} />
      {params.error ? <Banner tone="danger">{params.error}</Banner> : null}
      {params.saved ? <Banner tone="success">{params.saved}</Banner> : null}
      {loadError ? <Banner tone="warn">{loadError}</Banner> : null}

      <div className={fitStyles.grid}>
        <section className="adm-card">
          <div className="adm-card-head"><h2>Campaigns</h2><Badge>{campaigns.length}</Badge></div>
          {!campaigns.length ? <p className={styles.rowMeta}>Create a campaign to get a short QR-friendly URL.</p> : <div className={styles.rowList}>{campaigns.map((campaign) => { const stat = statsById.get(campaign.id); return <Link key={campaign.id} href={`/admin/fit-wars/${campaign.id}`} className={styles.row}><div className={styles.rowSummary}><span><strong>{campaign.school_name}</strong><small className={styles.rowMeta}> · /f/{campaign.code}</small></span><Badge tone={campaign.status === "active" ? "success" : campaign.status === "paused" ? "warn" : campaign.status === "archived" ? "danger" : undefined}>{campaign.status}</Badge></div><div className={fitStyles.rowStats}><span>{stat?.visitors ?? 0} visitors</span><span>{stat?.votes ?? 0} votes</span><span>{campaign.audience_type === "adult_opt_in" ? "Adult opt-in" : "High-school safeguards"}</span></div></Link>; })}</div>}
        </section>

        {canWrite ? <section className="adm-card">
          <div className="adm-card-head"><h2>New campaign</h2></div>
          <form action={createCampaign} className={styles.form}>
            <div className={styles.field}><label htmlFor="school_name">School or community name</label><input id="school_name" name="school_name" required placeholder="Mill Creek" /></div>
            <div className={styles.field}><label htmlFor="code">Short URL code</label><input id="code" name="code" required pattern="[a-z0-9][a-z0-9-]{1,31}" placeholder="mc" /><small className={styles.rowMeta}>Public URL: /f/your-code</small></div>
            <div className={styles.field}><label htmlFor="label">Campaign label</label><input id="label" name="label" placeholder="MILL CREEK FIT WARS" /></div>
            <div className={styles.field}><label htmlFor="headline">Headline</label><input id="headline" name="headline" defaultValue="WHOSE FIT IS BETTER?" /></div>
            <div className={styles.field}><label htmlFor="audience_type">Audience safeguards</label><select id="audience_type" name="audience_type" defaultValue="high_school"><option value="high_school">High-school campaign</option><option value="adult_opt_in">Adult opt-in competition</option></select></div>
            <button type="submit" className={styles.button}>Create campaign</button>
          </form>
        </section> : null}
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}><h2>Before publishing</h2></div>
        <div className={fitStyles.notes}><p>Only publish participant photos with documented permission. Instagram references can be saved, but Street does not scrape or republish Instagram images without an approved image source.</p><p>High-school campaigns show top-ranked outfits in results emails and avoid “worst dressed” labels.</p><p>Apply the Fit Wars migration and configure Resend before testing email delivery.</p></div>
      </section>
    </div>
  );
}
