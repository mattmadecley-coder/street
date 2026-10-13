import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "@/app/admin/admin.module.css";
import { Badge, Banner, PageHeader, StatTile } from "@/components/admin/ui";
import { CampaignActions } from "@/components/admin/campaign-actions";
import { ScheduleField } from "@/components/admin/schedule-field";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { requireUser } from "@/lib/admin-guard";
import { can } from "@/lib/admin-permissions";
import { computeStats, countUnsubscribes, getCampaign, loadCampaignSends, percent } from "@/lib/email-campaigns";
import { audienceFor, sendConfig, sendingProblems } from "@/lib/email-send";
import { getSegment, listSegments } from "@/lib/email-segments";
import { listTemplates } from "@/lib/email-templates";
import { loadEmailSettings } from "@/lib/email-settings";
import { supabaseRestPage } from "@/lib/supabase-rest";
import { cancelCampaignAction, deleteCampaignAction, saveCampaignAction, scheduleCampaignAction, sendNowAction, sendTestAction } from "../actions";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  saved: "Draft saved.",
  scheduled: "Scheduled. It will start sending at the time you picked.",
  started: "Sending has started. This page shows progress.",
  canceled: "Canceled. Anything not yet sent was dropped.",
};

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const principal = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  const canWrite = can(principal.role, "email.write");
  const canSend = can(principal.role, "email.send");
  const editable = campaign.status === "draft" || campaign.status === "scheduled";

  if (!editable) {
    const [sends, unsubscribed] = await Promise.all([loadCampaignSends(id), countUnsubscribes(id)]);
    const stats = computeStats(sends, unsubscribed);
    const done = stats.sent + stats.failed + stats.skipped;
    const { settings } = await loadEmailSettings();
    return (
      <div>
        <PageHeader title={campaign.name} crumbs={[{ label: "Campaigns", href: "/admin/email/campaigns" }, { label: campaign.name }]} subtitle={<>{campaign.subject} · <Badge tone={campaign.status === "sent" ? "success" : campaign.status === "sending" ? "warn" : undefined}>{campaign.status}</Badge></>} />
        {query.started ? <Banner tone="success">{NOTICES.started}</Banner> : null}
        {query.canceled ? <Banner tone="info">{NOTICES.canceled}</Banner> : null}
        {campaign.status === "sending" ? (
          <Banner tone="info">
            Sending: {done.toLocaleString()} of {stats.recipients.toLocaleString()} done. New domains start with a daily limit of {settings.dailyCap.toLocaleString()} emails; if the limit is reached, the rest goes out automatically over the following days. This page refreshes when you reload it.
            {canSend ? <form action={cancelCampaignAction} className="u-mt-14"><input type="hidden" name="id" value={id} /><ConfirmSubmitButton confirmTitle="Stop this campaign?" confirmText="People who haven't received it yet will not get it. Emails already sent can't be unsent." confirmLabel="Stop sending" className={styles.buttonSecondary}>Stop sending</ConfirmSubmitButton></form> : null}
          </Banner>
        ) : null}

        <div className="adm-tiles" style={{ marginTop: 16 }}>
          <StatTile label="Sent" value={stats.sent.toLocaleString()} note={`${stats.recipients.toLocaleString()} recipients${stats.skipped ? `, ${stats.skipped.toLocaleString()} skipped` : ""}${stats.failed ? `, ${stats.failed.toLocaleString()} failed` : ""}`} />
          <StatTile label="Delivered" value={percent(stats.delivered, stats.sent)} note={`${stats.delivered.toLocaleString()} people`} />
          <StatTile label="Opened" value={percent(stats.opened, stats.sent)} note={`${stats.opened.toLocaleString()} people. Apple Mail can count opens that never happened.`} />
          <StatTile label="Clicked" value={percent(stats.clicked, stats.sent)} note={`${stats.clicked.toLocaleString()} people`} />
          <StatTile label="Bounced" value={stats.bounced.toLocaleString()} note="Never emailed again" />
          <StatTile label="Unsubscribed" value={stats.unsubscribed.toLocaleString()} note={`${stats.complained.toLocaleString()} marked as spam`} />
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHead}><h2>Recipients</h2><span className={styles.rowMeta}>{sends.length > 200 ? "First 200 shown" : `${sends.length} total`}</span></div>
          <table className={styles.table}>
            <thead><tr><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Opened</th><th scope="col">Clicked</th></tr></thead>
            <tbody>
              {sends.slice(0, 200).map((send) => (
                <tr key={send.id}>
                  <th scope="row"><Link href={`/admin/email/contacts/${send.contact_id}`}>{send.email}</Link></th>
                  <td>{send.bounced_at ? "Bounced" : send.complained_at ? "Spam report" : send.status === "sent" ? (send.delivered_at ? "Delivered" : "Sent") : send.status === "skipped" ? `Skipped${send.error ? ` (${send.error})` : ""}` : send.status === "failed" ? `Failed (${send.error ?? "error"})` : "Waiting"}</td>
                  <td>{send.open_count || (send.first_opened_at ? 1 : 0) || "–"}</td>
                  <td>{send.click_count || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {campaign.status === "canceled" && canWrite ? (
          <form action={deleteCampaignAction} className="u-mt-14"><input type="hidden" name="id" value={id} /><ConfirmSubmitButton confirmTitle="Delete this campaign?" confirmText="Its results are removed too." confirmLabel="Delete" danger className={`${styles.buttonSecondary} ${styles.dangerText}`}>Delete campaign</ConfirmSubmitButton></form>
        ) : null}
      </div>
    );
  }

  const [{ templates }, { segments }, { settings }] = await Promise.all([listTemplates(), listSegments(), loadEmailSettings()]);
  const segment = campaign.segment_id ? await getSegment(campaign.segment_id) : null;
  const audience = segment ? (await audienceFor(segment.definition)).length : 0;
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { total: sentToday } = await supabaseRestPage<{ id: string }>(`email_campaign_sends?select=id&status=eq.sent&sent_at=gte.${encodeURIComponent(dayAgo)}`, { from: 0, to: 0 }, { noStore: true }).catch(() => ({ total: 0 }));
  const problems = sendingProblems(sendConfig());
  const template = templates.find((entry) => entry.id === campaign.template_id) ?? null;

  return (
    <div>
      <PageHeader title={campaign.name} crumbs={[{ label: "Campaigns", href: "/admin/email/campaigns" }, { label: campaign.name }]} subtitle={<Badge tone={campaign.status === "scheduled" ? "info" : undefined}>{campaign.status === "scheduled" ? "Scheduled" : "Draft"}</Badge>} />
      {query.error ? <p className={styles.noticeError} role="alert">{query.error}</p> : null}
      {query.saved ? <Banner tone="success">{NOTICES.saved}</Banner> : null}
      {query.scheduled ? <Banner tone="success">{NOTICES.scheduled}</Banner> : null}
      {query.tested ? <Banner tone="success">Test sent to {query.tested}. Check your inbox (and spam folder the first few times).</Banner> : null}
      {campaign.status === "scheduled" && campaign.scheduled_at ? <Banner tone="info">Scheduled for {new Date(campaign.scheduled_at).toLocaleString()} · {campaign.recipients_total.toLocaleString()} people when scheduled. You can still change it and press Update schedule.
        {canSend ? <form action={cancelCampaignAction} className="u-mt-14"><input type="hidden" name="id" value={id} /><button type="submit" className={styles.buttonSecondary}>Cancel the schedule</button></form> : null}</Banner> : null}
      {!canWrite ? <Banner tone="info">You have view-only access to campaigns.</Banner> : null}

      <form className={styles.form} style={{ maxWidth: 720 }}>
        <input type="hidden" name="id" value={id} />
        <div className={styles.field}><label htmlFor="name">Campaign name (only you see this)</label><input id="name" name="name" type="text" defaultValue={campaign.name} maxLength={80} required disabled={!canWrite} /></div>

        <div className={styles.field}>
          <label htmlFor="template_id">Template</label>
          <select id="template_id" name="template_id" defaultValue={campaign.template_id ?? ""} disabled={!canWrite}>
            <option value="">Choose a template…</option>
            {templates.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
          <small className={styles.rowMeta}>{template ? <Link href={`/admin/email/templates/${template.id}`}>Edit this template</Link> : <Link href="/admin/email/templates">Build a template</Link>} · changes to the template after you press Schedule or Send do not affect this campaign.</small>
        </div>

        <div className={styles.field}>
          <label htmlFor="segment_id">Who gets it</label>
          <select id="segment_id" name="segment_id" defaultValue={campaign.segment_id ?? ""} disabled={!canWrite}>
            <option value="">Choose a segment…</option>
            {segments.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
          <small className={styles.rowMeta}>{segment ? <><strong>{audience.toLocaleString()}</strong> people can be emailed right now. </> : null}<Link href="/admin/email/segments">Manage segments</Link>. Only people who are still subscribed ever receive email.</small>
        </div>

        <div className={styles.field}><label htmlFor="subject">Subject line</label><input id="subject" name="subject" type="text" defaultValue={campaign.subject} placeholder={template?.subject || "What people see in their inbox"} maxLength={200} disabled={!canWrite} /><small className={styles.rowMeta}>Leave empty to use the template’s subject{template?.subject ? `: “${template.subject}”` : ""}.</small></div>
        <div className={styles.field}><label htmlFor="preheader">Preview text (optional)</label><input id="preheader" name="preheader" type="text" defaultValue={campaign.preheader} placeholder={template?.preheader ?? ""} maxLength={200} disabled={!canWrite} /></div>

        <ScheduleField initialIso={campaign.scheduled_at} disabled={!canWrite} />

        <p className={styles.rowMeta}>Sends from <strong>{settings.fromName} &lt;{settings.fromLocal}@mail.streetdotcom.com&gt;</strong> · replies go to {settings.replyTo} · daily limit {settings.dailyCap.toLocaleString()} ({sentToday.toLocaleString()} sent in the last 24 hours) · <Link href="/admin/email/settings">change</Link></p>

        <CampaignActions save={saveCampaignAction} test={sendTestAction} schedule={scheduleCampaignAction} sendNow={sendNowAction} canSend={canSend} canWrite={canWrite} audience={audience} dailyCap={settings.dailyCap} sentToday={sentToday} scheduled={campaign.status === "scheduled"} blocked={problems.length ? problems[0] : null} />
      </form>

      {canWrite ? <form action={deleteCampaignAction} className="u-mt-14"><input type="hidden" name="id" value={id} /><ConfirmSubmitButton confirmTitle="Delete this draft?" confirmText="This can't be undone." confirmLabel="Delete" danger className={`${styles.buttonSecondary} ${styles.dangerText}`}>Delete draft</ConfirmSubmitButton></form> : null}
    </div>
  );
}
