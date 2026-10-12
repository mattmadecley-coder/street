import { supabaseRest } from "@/lib/supabase-rest";
import { EMAIL_POPUP_DEFAULTS, mergePopupConfig, type EmailPopupConfig } from "@/lib/email-popup-config";

export type EmailContact = {
  id: string;
  email: string;
  phone: string | null;
  phone_added_at: string | null;
  status: "subscribed" | "unsubscribed" | "bounced" | "complained";
  source: string | null;
  signup_path: string | null;
  device_type: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
  anonymous_ids: string[] | null;
  tags: string[] | null;
  token: string;
  emails_sent: number;
  open_count: number;
  click_count: number;
  first_opened_at: string | null;
  last_opened_at: string | null;
  last_clicked_at: string | null;
  unsubscribed_at: string | null;
  created_at: string;
};

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_REGEX.test(email) ? email : null;
}

/** US numbers default to +1; anything with a leading + keeps its country code. */
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function clean(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

// Tiny in-memory limiter (per server instance). Enough to blunt form spam.
const hits = new Map<string, number[]>();
export function rateLimited(key: string, limit = 8, windowMs = 60_000) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const k of hits.keys()) { if (!hits.get(k)?.some((t) => now - t < windowMs)) hits.delete(k); }
  return recent.length > limit;
}

export function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export function deviceFromUserAgent(ua: string | null) {
  if (!ua) return null;
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobi|iphone|android/i.test(ua)) return "mobile";
  return "desktop";
}

export async function logContactEvent(contactId: string, type: string, meta: Record<string, unknown> = {}, at?: string) {
  await supabaseRest("email_contact_events", {
    method: "POST",
    body: { contact_id: contactId, type, meta, ...(at ? { created_at: at } : {}) },
    prefer: "return=minimal",
  }).catch(() => undefined);
}

export async function getLivePopupConfig(): Promise<EmailPopupConfig> {
  try {
    const rows = await supabaseRest<{ config: unknown }[]>("email_popup_settings?id=eq.1&select=config&limit=1", { revalidateSeconds: 60 });
    return rows[0] ? mergePopupConfig(rows[0].config) : EMAIL_POPUP_DEFAULTS;
  } catch {
    return EMAIL_POPUP_DEFAULTS;
  }
}
