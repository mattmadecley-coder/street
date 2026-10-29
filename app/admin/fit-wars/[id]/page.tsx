import Link from "next/link";
import QRCode from "qrcode";
import styles from "@/app/admin/admin.module.css";
import fitStyles from "../fit-wars-admin.module.css";
import { Banner, Badge, EmptyState, PageHeader, StatTile } from "@/components/admin/ui";
import { requireUser } from "@/lib/admin-guard";
import { can } from "@/lib/admin-permissions";
import { getCampaignAdminData, publicCampaignUrl, type FitWarsOutfit } from "@/lib/fit-wars";
import { updateCampaign, setCampaignStatus, saveOutfit, removeOutfit, saveMatchup, removeMatchup, saveCommentary, removeCommentary } from "../actions";
import CopyUrlButton from "../copy-url-button";

export const dynamic = "force-dynamic";

function statusTone(status: string) { return status === "active" ? "success" as const : status === "paused" ? "warn" as const : status === "archived" ? "danger" as const : undefined; }

export default async function FitWarsCampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const principal = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const data = await getCampaignAdminData(id).catch(() => null);
  if (!data) {
    return <div><PageHeader title="Fit Wars campaign" crumbs={[{ label: "Fit Wars", href: "/admin/fit-wars" }, { label: "Campaign" }]} /><Banner tone="warn">This campaign is not available yet. Apply the Fit Wars database migration, then refresh.</Banner></div>;
  }
  const { campaign, outfits, matchups, leaderboard, stats } = data;
  const storedResultsHeadline = campaign.results_headline?.trim() ?? "";
  const resultsHeadline = storedResultsHeadline && storedResultsHeadline !== "YOU'VE GOT TASTE. OR DO YOU?" ? storedResultsHeadline : "WANT TO SEE WHO HAD THE WORST FIT?";
  const storedMarketingLabel = campaign.marketing_label?.trim() ?? "";
  const marketingLabel = storedMarketingLabel && storedMarketingLabel !== "Send me fashion finds and updates from Street." ? storedMarketingLabel : "Allow Street to send you emails";
  const canWrite = can(principal.role, "analytics.write");
  const url = publicCampaignUrl(campaign.code);
  const qr = await QRCode.toDataURL(url, { width: 220, margin: 1, color: { dark: "#101010", light: "#ffffff" } });
  const activeOutfits = outfits.filter((outfit) => outfit.is_active);

  return (
    <div>
      <PageHeader title={campaign.school_name} crumbs={[{ label: "Fit Wars", href: "/admin/fit-wars" }, { label: campaign.school_name }]} subtitle={<><Badge tone={statusTone(campaign.status)}>{campaign.status}</Badge> · {campaign.label || `${campaign.school_name} FIT WARS`}</>} actions={<><Link href={`/f/${campaign.code}?preview=1`} target="_blank" rel="noreferrer" className="adm-btn" data-variant="secondary">Preview ↗</Link>{campaign.status === "active" ? <Link href={url} target="_blank" rel="noreferrer" className="adm-btn">Open live ↗</Link> : null}</>} />
      {query.error ? <Banner tone="danger">{query.error}</Banner> : null}
      {query.saved ? <Banner tone="success">{query.saved}</Banner> : null}

      <div className={fitStyles.heroStats}>
        <div><strong>{stats.visitors.toLocaleString()}</strong><span>Landing visits</span></div>
        <div><strong>{stats.uniqueVisitors.toLocaleString()}</strong><span>Unique sessions</span></div>
        <div><strong>{stats.votes.toLocaleString()}</strong><span>Votes</span></div>
        <div><strong>{stats.completionRate}%</strong><span>Completion</span></div>
        <div><strong>{stats.emailRequests.toLocaleString()}</strong><span>Result emails</span></div>
        <div><strong>{stats.marketingOptIns.toLocaleString()}</strong><span>Marketing opt-ins</span></div>
        <div><strong>{stats.streetClicks.toLocaleString()}</strong><span>Street clicks</span></div>
        <div><strong>{stats.shares.toLocaleString()}</strong><span>Shares</span></div>
      </div>

      <section className="adm-card u-mb-16">
        <div className="adm-card-head"><h2>Launch controls</h2></div>
        <div className={fitStyles.urlBox}><code>{url}</code><CopyUrlButton value={url} /><span className={styles.rowMeta}>Use this URL in the QR artwork.</span></div>
        <div className={`${fitStyles.inline} u-mt-14`}>
          {campaign.status !== "active" ? <form action={setCampaignStatus}><input type="hidden" name="campaign_id" value={campaign.id} /><input type="hidden" name="status" value="active" /><button className="adm-btn" type="submit" disabled={!canWrite}>Publish campaign</button></form> : <form action={setCampaignStatus}><input type="hidden" name="campaign_id" value={campaign.id} /><input type="hidden" name="status" value="paused" /><button className="adm-btn" data-variant="secondary" type="submit" disabled={!canWrite}>Pause campaign</button></form>}
          {campaign.status !== "archived" ? <form action={setCampaignStatus}><input type="hidden" name="campaign_id" value={campaign.id} /><input type="hidden" name="status" value="archived" /><button className="adm-btn" data-variant="danger-outline" type="submit" disabled={!canWrite}>Archive</button></form> : null}
        </div>
        <div className="u-mt-18"><img src={qr} alt={`QR code for ${url}`} className={fitStyles.qr} /></div>
      </section>

      {canWrite ? <section className="adm-card u-mb-16">
        <div className="adm-card-head"><h2>Campaign settings</h2></div>
        <form action={updateCampaign} className={styles.form}>
          <input type="hidden" name="campaign_id" value={campaign.id} />
          <div className={styles.field}><label htmlFor="school_name">School name</label><input id="school_name" name="school_name" defaultValue={campaign.school_name} required /></div>
          <div className={styles.field}><label htmlFor="code">Short URL code</label><input id="code" name="code" defaultValue={campaign.code} required /></div>
          <div className={styles.field}><label htmlFor="label">Campaign label</label><input id="label" name="label" defaultValue={campaign.label} /></div>
          <div className={styles.field}><label htmlFor="headline">Headline</label><input id="headline" name="headline" defaultValue={campaign.headline} /></div>
          <div className={styles.field}><label htmlFor="audience_type">Audience safeguards</label><select id="audience_type" name="audience_type" defaultValue={campaign.audience_type}><option value="high_school">High-school campaign</option><option value="adult_opt_in">Adult opt-in competition</option></select></div>
          <div className={styles.field}><label htmlFor="results_headline">Results screen question</label><input id="results_headline" name="results_headline" defaultValue={resultsHeadline} /><span className={styles.rowMeta}>This is the large question visitors see after the final vote.</span></div>
          <div className={styles.field}><label htmlFor="results_copy">Results copy</label><textarea id="results_copy" name="results_copy" defaultValue={campaign.results_copy} /></div>
          <div className={styles.field}><label htmlFor="results_note">Results note</label><textarea id="results_note" name="results_note" defaultValue={campaign.results_note} /></div>
          <div className={styles.field}><label htmlFor="marketing_label">Marketing checkbox wording</label><input id="marketing_label" name="marketing_label" defaultValue={marketingLabel} /></div>
          <button type="submit" className={styles.button}>Save campaign settings</button>
        </form>
      </section> : null}

      <div className={fitStyles.split}>
        <section className="adm-card">
          <div className="adm-card-head"><h2>Outfits</h2><Badge>{activeOutfits.length} active</Badge></div>
          {!activeOutfits.length ? <EmptyState title="No approved outfits yet">Add two approved images before building a matchup.</EmptyState> : <div className={fitStyles.thumbGrid}>{activeOutfits.map((outfit) => <figure key={outfit.id} className={fitStyles.thumb}><img src={outfit.image_url} alt="" /><figcaption><strong>{outfit.display_name}</strong><br /><span className={styles.rowMeta}>{outfit.permission_status} · {outfit.source_type}</span></figcaption></figure>)}</div>}
          {canWrite ? <><OutfitForm campaignId={campaign.id} code={campaign.code} />{activeOutfits.map((outfit) => <OutfitForm key={`edit-${outfit.id}`} campaignId={campaign.id} code={campaign.code} outfit={outfit} />)}</> : null}
        </section>

        <section className="adm-card">
          <div className="adm-card-head"><h2>Current leaderboard</h2></div>
          {!leaderboard.length ? <p className={styles.rowMeta}>Votes will appear here after the first round.</p> : <table className={styles.table}><thead><tr><th>#</th><th>Outfit</th><th>Votes</th><th>Share</th></tr></thead><tbody>{leaderboard.map((row, index) => <tr key={row.outfitId}><td>{index + 1}</td><th scope="row"><span className="u-row-12"><img src={row.imageUrl} alt="" className={styles.productThumb} />{row.displayName}</span></th><td>{row.votes}</td><td>{row.percentage}%</td></tr>)}</tbody></table>}
        </section>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}><h2>Matchups and commentary</h2><span className={styles.rowMeta}>{matchups.filter((matchup) => matchup.is_active).length} active comparisons</span></div>
        {canWrite ? <MatchupForm campaignId={campaign.id} outfits={activeOutfits} /> : null}
        {!matchups.length ? <EmptyState title="No matchups yet">Select two approved outfits to create the first comparison.</EmptyState> : matchups.map((matchup) => <div className={fitStyles.matchup} key={matchup.id}><div className={fitStyles.matchupHead}><strong>Round {matchup.position}</strong><span className={styles.rowMeta}>{matchup.is_active ? `${matchup.duration_ms}ms interstitial` : "inactive"}</span></div><div className={fitStyles.matchupOutfits}><div className={fitStyles.matchupOutfit}>{matchup.left ? <img src={matchup.left.image_url} alt="" /> : null}<span>{matchup.left?.display_name ?? "Missing outfit"}</span></div><div className={fitStyles.matchupOutfit}>{matchup.right ? <img src={matchup.right.image_url} alt="" /> : null}<span>{matchup.right?.display_name ?? "Missing outfit"}</span></div></div>{matchup.messages.map((message) => <div className={fitStyles.message} key={message.id}><p>{message.body}{message.link_url ? <> · <a href={message.link_url}>{message.link_label || message.link_url}</a></> : null}</p>{canWrite ? <form action={removeCommentary}><input type="hidden" name="campaign_id" value={campaign.id} /><input type="hidden" name="commentary_id" value={message.id} /><button className="adm-btn" data-variant="ghost" data-size="sm" type="submit">Remove</button></form> : null}</div>)}{canWrite ? <div className="u-mt-10"><CommentaryForm campaignId={campaign.id} matchupId={matchup.id} /></div> : null}{canWrite && matchup.is_active ? <form action={removeMatchup} className="u-mt-10"><input type="hidden" name="campaign_id" value={campaign.id} /><input type="hidden" name="matchup_id" value={matchup.id} /><button className="adm-btn" data-variant="danger-outline" data-size="sm" type="submit">Remove matchup</button></form> : null}</div>)}
      </section>
    </div>
  );
}

function OutfitForm({ campaignId, code, outfit }: { campaignId: string; code: string; outfit?: FitWarsOutfit }) {
  return <div className={fitStyles.formCard}><form action={saveOutfit} className={styles.form} encType="multipart/form-data"><input type="hidden" name="campaign_id" value={campaignId} />{outfit ? <input type="hidden" name="outfit_id" value={outfit.id} /> : null}<input type="hidden" name="code" value={code} /><div className={styles.field}><label>{outfit ? `Edit ${outfit.display_name}` : "Add outfit"}</label><input name="display_name" defaultValue={outfit?.display_name} required placeholder="Nickname or display name" /></div><div className={styles.field}><label>Image upload</label><input name="image_file" type="file" accept="image/*" /></div><div className={styles.field}><label>Or direct image URL</label><input name="image_url" type="url" defaultValue={outfit?.image_url} placeholder="https://…" /></div><div className={styles.field}><label>Source type</label><select name="source_type" defaultValue={outfit?.source_type ?? "url"}><option value="upload">Uploaded image</option><option value="url">Direct image URL</option><option value="instagram">Instagram reference + approved image</option></select></div><div className={styles.field}><label>Instagram reference (optional)</label><input name="instagram_url" type="url" defaultValue={outfit?.instagram_url ?? ""} placeholder="https://instagram.com/p/…" /></div><div className={styles.field}><label>Permission status</label><select name="permission_status" defaultValue={outfit?.permission_status ?? "pending"}><option value="pending">Pending review</option><option value="approved">Approved to publish</option><option value="rejected">Rejected</option><option value="removed">Removed</option></select></div><div className={styles.field}><label>Permission note</label><textarea name="permission_note" defaultValue={outfit?.permission_note ?? ""} placeholder="Who approved use of this image?" /></div><button type="submit" className={styles.button}>{outfit ? "Save outfit" : "Add outfit"}</button></form>{outfit ? <form action={removeOutfit} className="u-mt-10"><input type="hidden" name="campaign_id" value={campaignId} /><input type="hidden" name="outfit_id" value={outfit.id} /><button type="submit" className="adm-btn" data-variant="danger-outline">Remove outfit</button></form> : null}</div>;
}

function MatchupForm({ campaignId, outfits }: { campaignId: string; outfits: FitWarsOutfit[] }) {
  return <form action={saveMatchup} className={`${styles.form} ${fitStyles.formCard}`}><input type="hidden" name="campaign_id" value={campaignId} /><div className={fitStyles.inline}><div className={styles.field}><label>Order</label><input name="position" type="number" min="1" defaultValue="1" /></div><div className={styles.field}><label>Interstitial ms</label><input name="duration_ms" type="number" min="1800" max="10000" defaultValue="3500" /></div></div><div className={fitStyles.inline}><div className={styles.field}><label>Left outfit</label><select name="left_outfit_id" required><option value="">Choose…</option>{outfits.map((outfit) => <option key={outfit.id} value={outfit.id}>{outfit.display_name}</option>)}</select></div><div className={styles.field}><label>Right outfit</label><select name="right_outfit_id" required><option value="">Choose…</option>{outfits.map((outfit) => <option key={outfit.id} value={outfit.id}>{outfit.display_name}</option>)}</select></div></div><button type="submit" className={styles.button}>Create matchup</button></form>;
}

function CommentaryForm({ campaignId, matchupId }: { campaignId: string; matchupId: string }) {
  return <form action={saveCommentary} className={fitStyles.inline}><input type="hidden" name="campaign_id" value={campaignId} /><input type="hidden" name="matchup_id" value={matchupId} /><input name="body" required placeholder="Add a commentary variation…" /><input name="link_label" placeholder="Link label" /><input name="link_url" type="url" placeholder="Brand or product URL" /><button type="submit" className="adm-btn" data-size="sm">Add message</button></form>;
}
