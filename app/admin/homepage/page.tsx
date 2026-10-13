import styles from "@/app/admin/admin.module.css";
import { getSiteSettings } from "@/lib/site-settings";
import { getBrandDirectory } from "@/lib/catalog-store";
import { getActiveHomepageFeatureSchedule, getHomepageFeatureSchedules } from "@/lib/homepage-feature-schedule";
import { removeHomepageFeature, restoreHomepageVersion, saveHomepageSettings, scheduleHomepageFeature, updateScheduledFeatureAction } from "./actions";
import { HomepagePreview } from "@/components/admin/homepage-preview";
import { PageHeader } from "@/components/admin/ui";
import { loadHomepageHistory } from "@/lib/homepage-history";
import { can } from "@/lib/admin-permissions";
import { SubmitButton } from "@/components/admin/submit-button";
import { PendingStatus } from "@/components/admin/pending-status";
import { ScrollMemory } from "@/components/admin/scroll-memory";
import { requireUser } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

function easternDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/** yyyy-MM-ddTHH:mm in Eastern wall-clock time, for a datetime-local input's `value`/`min`. */
function easternDateTimeLocalValue(value: string | number | Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export default async function AdminHomepagePage({ searchParams }: { searchParams: Promise<{ saved?: string; scheduled?: string; deleted?: string; edit?: string; scheduleError?: string; scheduleUpdated?: string }> }) {
  const principal = await requireUser();
  const canWrite = can(principal.role, "homepage.write");
  const { saved, scheduled, deleted, edit, scheduleError, scheduleUpdated } = await searchParams;
  const [settings, brands, schedules, activeSchedule, history] = await Promise.all([
    getSiteSettings(),
    getBrandDirectory(),
    getHomepageFeatureSchedules(),
    getActiveHomepageFeatureSchedule(new Date(), true),
    loadHomepageHistory(),
  ]);
  const brandNames = new Map(brands.map((brand) => [brand.slug, brand.name]));
  const now = Date.now();
  const nowEasternLocal = easternDateTimeLocalValue(now);
  const editingSchedule = edit ? schedules.find((item) => item.id === edit) : undefined;
  const brandNameMap = Object.fromEntries(brands.map((brand) => [brand.slug, brand.name]));
  const live = {
    imageUrl: activeSchedule?.heroImageUrl || settings.hero_image_url,
    videoUrl: activeSchedule?.heroVideoUrl || settings.hero_video_url,
    brandName: brandNameMap[activeSchedule?.brandSlug ?? settings.featured_brand_slug] ?? (activeSchedule?.brandSlug ?? settings.featured_brand_slug),
    ctaLabel: activeSchedule?.ctaLabel || settings.featured_brand_cta_label,
  };
  const nextScheduled = schedules.filter((item) => new Date(item.startsAt).getTime() > now).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];

  return (
    <div>
      <PageHeader title="Homepage" subtitle="Change the homepage now or schedule future featured brands and hero media. Scheduled times use Eastern Time and become visible within about one minute." />
      {scheduleError ? <p className={styles.noticeError} role="alert">{scheduleError}</p> : null}

      <section aria-label="Live now">
        <HomepagePreview title={activeSchedule ? "Live now: scheduled feature" : "Live now: fallback homepage"} initial={live} />
        <p className={styles.rowMeta}>
          {activeSchedule ? <>A scheduled feature is live: <strong>{live.brandName}</strong>, started {easternDateTime(activeSchedule.startsAt)} ET. It stays up until a later one starts.</> : <>No scheduled feature is live, so visitors see the fallback below.</>}
          {nextScheduled ? <> Next up: <strong>{brandNames.get(nextScheduled.brandSlug) ?? nextScheduled.brandSlug}</strong> on {easternDateTime(nextScheduled.startsAt)} ET.</> : null}
        </p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><h2>Fallback homepage</h2><p className={styles.rowMeta}>Visitors see this whenever no scheduled feature is live. Editing it changes the live site as soon as you save, and the preview below updates as you type.</p></div></div>
        {canWrite ? (
          <HomepagePreview title="Preview of your changes" formId="homepage-fallback-form" brandNames={brandNameMap} initial={{ imageUrl: settings.hero_image_url, videoUrl: settings.hero_video_url, brandName: brandNameMap[settings.featured_brand_slug] ?? settings.featured_brand_slug, ctaLabel: settings.featured_brand_cta_label }} />
        ) : null}
        <form action={saveHomepageSettings} id="homepage-fallback-form" className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="hero_image_file">Hero image — upload a new one</label>
            <input id="hero_image_file" name="hero_image_file" type="file" accept="image/*" />
          </div>
          <div className={styles.field}>
            <label htmlFor="hero_image_url">Hero image — or paste a URL</label>
            <input id="hero_image_url" name="hero_image_url" type="text" defaultValue={settings.hero_image_url} placeholder="https://..." />
          </div>
          <div className={styles.field}>
            <label htmlFor="hero_video_url">Hero video URL (optional — takes priority over the image)</label>
            <input id="hero_video_url" name="hero_video_url" type="text" defaultValue={settings.hero_video_url} placeholder="https://..." />
          </div>
          <div className={styles.field}>
            <label htmlFor="featured_brand_slug">Featured brand</label>
            <select id="featured_brand_slug" name="featured_brand_slug" defaultValue={settings.featured_brand_slug}>
              {brands.map((brand) => <option key={brand.slug} value={brand.slug}>{brand.name}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="featured_brand_cta_label">Spotlight button label</label>
            <input id="featured_brand_cta_label" name="featured_brand_cta_label" type="text" defaultValue={settings.featured_brand_cta_label} placeholder="Shop this brand" />
          </div>
          <SubmitButton pendingText="Saving…" className={styles.button}>Save live homepage</SubmitButton>
          <PendingStatus label="Saving — uploading the new hero image if one was selected" />
        </form>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><h2>Schedule a future feature</h2><p className={styles.rowMeta}>At the selected time, this brand and its media automatically replace the current feature. It stays live until a later scheduled entry starts.</p></div></div>
        <form action={scheduleHomepageFeature} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="starts_at">Start date and time (Eastern Time)</label>
            <input id="starts_at" name="starts_at" type="datetime-local" min={nowEasternLocal} required />
          </div>
          <div className={styles.field}>
            <label htmlFor="scheduled_brand_slug">Featured brand</label>
            <select id="scheduled_brand_slug" name="scheduled_brand_slug" required defaultValue="">
              <option value="" disabled>Choose a brand</option>
              {brands.filter((brand) => brand.productCount > 0).map((brand) => <option key={brand.slug} value={brand.slug}>{brand.name}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="scheduled_hero_image_file">Hero image — upload</label>
            <input id="scheduled_hero_image_file" name="scheduled_hero_image_file" type="file" accept="image/*" />
          </div>
          <div className={styles.field}>
            <label htmlFor="scheduled_hero_image_url">Hero image — or paste a URL</label>
            <input id="scheduled_hero_image_url" name="scheduled_hero_image_url" type="text" placeholder="Leave blank to keep the fallback image" />
          </div>
          <div className={styles.field}>
            <label htmlFor="scheduled_hero_video_url">Hero video URL</label>
            <input id="scheduled_hero_video_url" name="scheduled_hero_video_url" type="text" placeholder="Leave blank to keep the fallback video" />
          </div>
          <div className={styles.field}>
            <label htmlFor="scheduled_cta_label">Spotlight button label</label>
            <input id="scheduled_cta_label" name="scheduled_cta_label" type="text" defaultValue="Shop this brand" />
          </div>
          <SubmitButton pendingText="Adding…" className={styles.button}>Add to schedule</SubmitButton>
          <PendingStatus label="Adding — uploading the hero image if one was selected" />
        </form>
      </section>

      <ScrollMemory>
      <section className={styles.section}>
        <div className={styles.sectionHead}><h2>Featured-brand schedule</h2><span className={styles.rowMeta}>{schedules.length} saved</span></div>
        {schedules.length ? (
          <div className="u-scroll-x">
            <table className={styles.table}>
              <thead><tr><th>Starts</th><th>Brand</th><th>Media</th><th>CTA</th><th>Status</th><th /></tr></thead>
              <tbody>
                {schedules.map((item) => {
                  const started = new Date(item.startsAt).getTime() <= now;
                  const status = activeSchedule?.id === item.id ? "Live" : started ? "Past" : "Scheduled";
                  const media = item.heroVideoUrl ? "Video" : item.heroImageUrl ? "Image" : "Uses fallback media";
                  if (editingSchedule && editingSchedule.id === item.id) {
                    return (
                      <tr key={item.id}>
                        <td colSpan={6}>
                          <form action={updateScheduledFeatureAction} className={`${styles.form} u-my-10`}>
                            <input type="hidden" name="schedule_id" value={item.id} />
                            <div className={styles.field}>
                              <label htmlFor={`edit_starts_at_${item.id}`}>Start date and time (Eastern Time)</label>
                              <input id={`edit_starts_at_${item.id}`} name="starts_at" type="datetime-local" min={nowEasternLocal} defaultValue={easternDateTimeLocalValue(item.startsAt)} required />
                            </div>
                            <div className={styles.field}>
                              <label htmlFor={`edit_brand_${item.id}`}>Featured brand</label>
                              <select id={`edit_brand_${item.id}`} name="scheduled_brand_slug" required defaultValue={item.brandSlug}>
                                {brands.filter((brand) => brand.productCount > 0 || brand.slug === item.brandSlug).map((brand) => <option key={brand.slug} value={brand.slug}>{brand.name}</option>)}
                              </select>
                            </div>
                            <div className={styles.field}>
                              <label htmlFor={`edit_hero_file_${item.id}`}>Hero image — upload a new one</label>
                              <input id={`edit_hero_file_${item.id}`} name="scheduled_hero_image_file" type="file" accept="image/*" />
                            </div>
                            <div className={styles.field}>
                              <label htmlFor={`edit_hero_url_${item.id}`}>Hero image — or paste a URL</label>
                              <input id={`edit_hero_url_${item.id}`} name="scheduled_hero_image_url" type="text" defaultValue={item.heroImageUrl} placeholder="Leave blank to keep the fallback image" />
                            </div>
                            <div className={styles.field}>
                              <label htmlFor={`edit_hero_video_${item.id}`}>Hero video URL</label>
                              <input id={`edit_hero_video_${item.id}`} name="scheduled_hero_video_url" type="text" defaultValue={item.heroVideoUrl} placeholder="Leave blank to keep the fallback video" />
                            </div>
                            <div className={styles.field}>
                              <label htmlFor={`edit_cta_${item.id}`}>Spotlight button label</label>
                              <input id={`edit_cta_${item.id}`} name="scheduled_cta_label" type="text" defaultValue={item.ctaLabel} />
                            </div>
                            <div className={styles.actions}>
                              <SubmitButton pendingText="Saving…" className={styles.button}>Save changes</SubmitButton>
                              <a href="/admin/homepage" className={styles.buttonSecondary}>Cancel</a>
                            </div>
                            <PendingStatus label="Saving — uploading the new hero image if one was selected" />
                          </form>
                        </td>
                      </tr>
                    );
                  }
                  return <tr key={item.id}>
                    <td>{easternDateTime(item.startsAt)} ET</td>
                    <td>{brandNames.get(item.brandSlug) ?? item.brandSlug}</td>
                    <td>{media}</td>
                    <td>{item.ctaLabel}</td>
                    <td><span className={styles.pill}>{status}</span></td>
                    <td>
                      <div className="u-row">
                        <a href={`/admin/homepage?edit=${item.id}`} className={styles.buttonSecondary}>Edit</a>
                        <form action={removeHomepageFeature}><input type="hidden" name="schedule_id" value={item.id} /><SubmitButton pendingText="Removing…" className={styles.buttonSecondary}>Remove</SubmitButton></form>
                      </div>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        ) : <p className={styles.rowMeta}>No future homepage features are scheduled yet.</p>}
      </section>
      </ScrollMemory>

      <section className={styles.section} aria-label="Version history">
        <div className={styles.sectionHead}><div><h2>Fallback history</h2><p className={styles.rowMeta}>Each time the fallback homepage is replaced, what was live is kept here so you can put it back. The last 20 are kept.</p></div></div>
        {!history.available ? <p className={styles.rowMeta}>Version history switches on after the 20261014_admin_state database update is applied.</p> : history.items.length === 0 ? <p className={styles.rowMeta}>Nothing replaced yet.</p> : (
          <ul className="adm-version-list">
            {history.items.map((version) => (
              <li key={version.at}>
                {version.settings.hero_image_url ? <img src={version.settings.hero_image_url} alt="" className="adm-version-thumb" /> : <span className="adm-version-thumb" />}
                <div>
                  <strong>{brandNameMap[version.settings.featured_brand_slug] ?? version.settings.featured_brand_slug}</strong>
                  <span className={`${styles.rowMeta} u-block`}>Replaced {easternDateTime(version.at)} ET by {version.by}{version.settings.hero_video_url ? " · video" : ""}</span>
                </div>
                {canWrite ? (
                  <form action={restoreHomepageVersion}>
                    <input type="hidden" name="at" value={version.at} />
                    <SubmitButton pendingText="Restoring…" className={styles.buttonSecondary}>Restore</SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
