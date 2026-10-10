import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { EmailPopupDesigner } from "@/components/admin/email-popup-designer";

export const dynamic = "force-dynamic";

export default function AdminEmailPopupPage() {
  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/email-popup" />
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2>Email popup mockup</h2>
            <p className={styles.rowMeta}>Edit the words, image and timing, then click through the steps. Nothing is live on the storefront yet.</p>
          </div>
        </div>
        <EmailPopupDesigner />
      </section>
    </div>
  );
}
