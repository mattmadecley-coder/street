import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { EmailTabs } from "@/components/admin/email-tabs";
import { EmailPopupDesigner } from "@/components/admin/email-popup-designer";
import { supabaseRest } from "@/lib/supabase-rest";
import { EMAIL_POPUP_DEFAULTS, mergePopupConfig } from "@/lib/email-popup-config";
import { requireUser } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export default async function AdminEmailPopupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const params = await searchParams;
  const rows = await supabaseRest<{ config: unknown }[]>("email_popup_settings?id=eq.1&select=config&limit=1", { noStore: true }).catch(() => []);
  const initial = rows[0] ? mergePopupConfig(rows[0].config) : EMAIL_POPUP_DEFAULTS;
  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/email" />
      <h1 className={styles.title}>Email</h1>
      <EmailTabs active="/admin/email/popup" />
      {params.error ? <p className={styles.noticeError}>{params.error}</p> : null}
      {params.published === "live" ? <p className={styles.notice}>Published. The popup is live on the site (it can take up to a minute to appear).</p> : null}
      {params.published === "off" ? <p className={styles.notice}>Saved. The popup is turned off on the site.</p> : null}
      <p className={styles.subtitle}>Step 1 asks only for an email and saves it right away. Step 2 adds a phone number to that same customer. Everyone who signs up lands in Customers.</p>
      <EmailPopupDesigner initial={initial} />
    </div>
  );
}
