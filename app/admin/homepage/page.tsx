import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { getSiteSettings } from "@/lib/site-settings";
import { getBrandDirectory } from "@/lib/catalog-store";
import { saveHomepageSettings } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminHomepagePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const [settings, brands] = await Promise.all([getSiteSettings(), getBrandDirectory()]);

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/homepage" />
      <h1 className={styles.title}>Homepage</h1>
      <p className={styles.subtitle}>Controls the hero section on street&rsquo;s homepage — the image/video, and which brand the spotlight links to.</p>

      {saved ? <p className={styles.notice}>Saved. The homepage will reflect this within a few seconds.</p> : null}

      <form action={saveHomepageSettings} className={styles.form} encType="multipart/form-data">
        <div className={styles.field}>
          <label htmlFor="hero_image_file">Hero image — upload a new one</label>
          <input id="hero_image_file" name="hero_image_file" type="file" accept="image/*" />
        </div>
        <div className={styles.field}>
          <label htmlFor="hero_image_url">Hero image — or paste a URL</label>
          <input id="hero_image_url" name="hero_image_url" type="text" defaultValue={settings.hero_image_url} placeholder="https://..." />
        </div>
        {settings.hero_image_url ? (
          <img src={settings.hero_image_url} alt="Current hero" style={{ width: "100%", maxWidth: 360, aspectRatio: "16/9", objectFit: "cover", border: "1px solid rgba(16,16,16,.16)" }} />
        ) : null}

        <div className={styles.field}>
          <label htmlFor="hero_video_url">Hero video URL (optional — takes priority over the image when set)</label>
          <input id="hero_video_url" name="hero_video_url" type="text" defaultValue={settings.hero_video_url} placeholder="https://..." />
        </div>

        <div className={styles.field}>
          <label htmlFor="featured_brand_slug">Featured brand (the &ldquo;check out their collections&rdquo; spotlight)</label>
          <select id="featured_brand_slug" name="featured_brand_slug" defaultValue={settings.featured_brand_slug}>
            {brands.map((brand) => <option key={brand.slug} value={brand.slug}>{brand.name}</option>)}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="featured_brand_cta_label">Spotlight button label</label>
          <input id="featured_brand_cta_label" name="featured_brand_cta_label" type="text" defaultValue={settings.featured_brand_cta_label} />
        </div>

        <button type="submit" className={styles.button}>Save homepage</button>
      </form>
    </div>
  );
}
