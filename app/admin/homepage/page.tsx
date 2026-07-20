import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { getSiteSettings } from "@/lib/site-settings";
import { getBrandDirectory } from "@/lib/catalog-store";
import { getActiveHomepageFeatureSchedule, getHomepageFeatureSchedules } from "@/lib/homepage-feature-schedule";
import { removeHomepageFeature, saveHomepageSettings, scheduleHomepageFeature } from "./actions";

export const dynamic = "force-dynamic";

function easternDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AdminHomepagePage({ searchParams }: { searchParams: Promise<{ saved?: string; scheduled?: string; deleted?: string }> }) {
  const { saved, scheduled, deleted } = await searchParams;
  const [settings, brands, schedules, activeSchedule] = await Promise.all([
    getSiteSettings(),
    getBrandDirectory(),
    getHomepageFeatureSchedules(),
    getActiveHomepageFeatureSchedule(new Date(), true),
  ]);
  const brandNames = new Map(brands.map((brand) => [brand.slug, brand.name]));
  const now = Date.now();

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/homepage" />
      <h1 className={styles.title}>Homepage</h1>
      <p className={styles.subtitle}>Change the homepage now or schedule future featured brands and hero media. Scheduled times use Eastern Time and become visible within about one minute.</p>

      {saved ? <p className={styles.notice}>The live homepage fallback was saved.</p> : null}
      {scheduled ? <p className={styles.notice}>The featured brand and media were scheduled.</p> : null}
      {deleted ? <p className={styles.notice}>The scheduled feature was removed.</p> : null}
      {activeSchedule ? <p className={styles.notice}>A scheduled feature is currently live: <strong>{brandNames.get(activeSchedule.brandSlug) ?? activeSchedule.brandSlug}</strong>, started {easternDateTime(activeSchedule.startsAt)} ET.</p> : null}

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><h2>Change it now</h2><p className={styles.rowMeta}>This is also the fallback whenever no scheduled feature has started.</p></div></div>
        <form action={saveHomepageSettings} className={styles.form} encType="multipart/form-data">
          <div className={styles.field}>
            <label htmlFor="hero_image_file">Hero image — upload a new one</label>
            <input id="hero_image_file" name="hero_image_file" type="file" accept="image/*" />
          </div>
          <div className={styles.field}>
            <label htmlFor="hero_image_url">Hero image — or paste a URL</label>
            <input id="hero_image_url" name="hero_image_url" type="text" defaultValue={settings.hero_image_url} placeholder="https://..." />
          </div>
          {settings.hero_image_url ? <img src={settings.hero_image_url} alt="Current hero" style={{ width: "100%", maxWidth: 360, aspectRatio: "16/9", objectFit: "cover", border: "1px solid rgba(16,16,16,.16)" }} /> : null}
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
          <button type="submit" className={styles.button}>Save live homepage</button>
        </form>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><h2>Schedule a future feature</h2><p className={styles.rowMeta}>At the selected time, this brand and its media automatically replace the current feature. It stays live until a later scheduled entry starts.</p></div></div>
        <form action={scheduleHomepageFeature} className={styles.form} encType="multipart/form-data">
          <div className={styles.field}>
            <label htmlFor="starts_at">Start date and time (Eastern Time)</label>
            <input id="starts_at" name="starts_at" type="datetime-local" required />
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
          <button type="submit" className={styles.button}>Add to schedule</button>
        </form>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><h2>Featured-brand schedule</h2><span className={styles.rowMeta}>{schedules.length} saved</span></div>
        {schedules.length ? (
          <div style={{ overflowX: "auto" }}>
            <table className={styles.table}>
              <thead><tr><th>Starts</th><th>Brand</th><th>Media</th><th>CTA</th><th>Status</th><th /></tr></thead>
              <tbody>
                {schedules.map((item) => {
                  const started = new Date(item.startsAt).getTime() <= now;
                  const status = activeSchedule?.id === item.id ? "Live" : started ? "Past" : "Scheduled";
                  const media = item.heroVideoUrl ? "Video" : item.heroImageUrl ? "Image" : "Uses fallback media";
                  return <tr key={item.id}>
                    <td>{easternDateTime(item.startsAt)} ET</td>
                    <td>{brandNames.get(item.brandSlug) ?? item.brandSlug}</td>
                    <td>{media}</td>
                    <td>{item.ctaLabel}</td>
                    <td><span className={styles.pill}>{status}</span></td>
                    <td><form action={removeHomepageFeature}><input type="hidden" name="schedule_id" value={item.id} /><button type="submit" className={styles.buttonSecondary}>Remove</button></form></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        ) : <p className={styles.rowMeta}>No future homepage features are scheduled yet.</p>}
      </section>
    </div>
  );
}
