import { getLivePopupConfig } from "@/lib/email-marketing";
import { EmailPopup } from "@/components/email-popup";

// Server component: reads the published popup settings (cached ~60s) and hands them to the client popup.
export async function EmailPopupLoader() {
  const config = await getLivePopupConfig();
  if (!config.enabled) return null;
  return <EmailPopup config={config} />;
}
