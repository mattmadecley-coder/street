import { readAdminState, writeAdminState } from "@/lib/admin-state";
import { normalizeEmail } from "@/lib/email-marketing";

/**
 * Sending settings for customer email. Stored in admin_state ("email_settings"). Customer email is
 * sent from a dedicated subdomain so its reputation never affects brand outreach on the main domain.
 */
export type EmailSettings = { fromName: string; fromLocal: string; replyTo: string; dailyCap: number };

export const SENDING_DOMAIN = (process.env.EMAIL_SENDING_DOMAIN ?? "mail.streetdotcom.com").trim().toLowerCase();
/** A new sending domain has no reputation yet, so start small and raise this as it warms up. */
export const DEFAULT_DAILY_CAP = 300;
export const MAX_DAILY_CAP = 100000;

export const DEFAULT_SETTINGS: EmailSettings = { fromName: "Street", fromLocal: "hello", replyTo: "hello@streetdotcom.com", dailyCap: DEFAULT_DAILY_CAP };

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function cleanSettings(input: unknown): EmailSettings {
  const raw = (typeof input === "object" && input ? input : {}) as Record<string, unknown>;
  const fromName = text(raw.fromName, 60).replace(/[<>",;]/g, "") || DEFAULT_SETTINGS.fromName;
  const local = text(raw.fromLocal, 40).toLowerCase();
  const fromLocal = /^[a-z0-9][a-z0-9._+-]{0,39}$/.test(local) ? local : DEFAULT_SETTINGS.fromLocal;
  const replyTo = normalizeEmail(raw.replyTo) ?? DEFAULT_SETTINGS.replyTo;
  const cap = typeof raw.dailyCap === "number" ? raw.dailyCap : Number(raw.dailyCap);
  const dailyCap = Number.isInteger(cap) && cap >= 1 && cap <= MAX_DAILY_CAP ? cap : DEFAULT_SETTINGS.dailyCap;
  return { fromName, fromLocal, replyTo, dailyCap };
}

export const fromAddress = (settings: EmailSettings) => `${settings.fromName} <${settings.fromLocal}@${SENDING_DOMAIN}>`;

export async function loadEmailSettings(): Promise<{ settings: EmailSettings; available: boolean }> {
  const { value, available } = await readAdminState<unknown>("email_settings", DEFAULT_SETTINGS);
  return { settings: cleanSettings(value), available };
}

export async function saveEmailSettings(input: unknown): Promise<EmailSettings> {
  const settings = cleanSettings(input);
  await writeAdminState("email_settings", settings);
  return settings;
}
