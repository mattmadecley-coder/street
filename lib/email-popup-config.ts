// Shared by the storefront popup and the admin designer.
// Step 1 asks only for the email (saved the moment it's entered), step 2 asks for a phone number.

export type EmailPopupConfig = {
  enabled: boolean;
  image: string;
  /** Crop: which part of the photo stays in frame (0-100 = left/top to right/bottom) and how far it is zoomed (1-3). */
  imageX: number;
  imageY: number;
  imageZoom: number;
  brandLine: string;
  step1Title: string;
  step1Body: string;
  emailPlaceholder: string;
  step1Button: string;
  step2Title: string;
  step2Body: string;
  phonePlaceholder: string;
  step2Button: string;
  skipLabel: string;
  smsFineprint: string;
  fineprint: string;
  doneTitle: string;
  doneBody: string;
  delaySeconds: number;
  minPages: number;
  showOnMobile: boolean;
  suppressDays: number;
  accent: string;
};

export const EMAIL_POPUP_DEFAULTS: EmailPopupConfig = {
  enabled: false,
  image: "https://cdn.shopify.com/s/files/1/0001/8192/7990/files/BLACKISLANDKNOCKOUTTRACKSUITFRONT_f10bfaca-e672-423d-9a4e-7fd64e7f132e.png?v=1784840211",
  imageX: 50,
  imageY: 50,
  imageZoom: 1,
  brandLine: "Street",
  step1Title: "Be the first to know.",
  step1Body: "New pieces from independent brands drop and sell out fast. Drop your email and we'll tell you first.",
  emailPlaceholder: "you@email.com",
  step1Button: "Next",
  step2Title: "Want a text too?",
  step2Body: "Add your number and we'll text you when something big drops. Totally optional.",
  phonePlaceholder: "(555) 555-5555",
  step2Button: "Finish",
  skipLabel: "No thanks",
  smsFineprint: "By adding your number you agree to get texts from Street. Msg & data rates may apply. Reply STOP to opt out.",
  fineprint: "By signing up you agree to get emails from Street. Unsubscribe any time.",
  doneTitle: "You're on the list.",
  doneBody: "We'll email you the moment new pieces drop. Keep browsing in the meantime.",
  delaySeconds: 20,
  minPages: 2,
  showOnMobile: true,
  suppressDays: 14,
  accent: "#101010",
};

export function mergePopupConfig(raw: unknown): EmailPopupConfig {
  const out: EmailPopupConfig = { ...EMAIL_POPUP_DEFAULTS };
  if (!raw || typeof raw !== "object") return out;
  const source = raw as Record<string, unknown>;
  for (const key of Object.keys(EMAIL_POPUP_DEFAULTS) as (keyof EmailPopupConfig)[]) {
    const fallback = EMAIL_POPUP_DEFAULTS[key];
    const value = source[key];
    if (typeof fallback === "string" && typeof value === "string") (out as Record<string, unknown>)[key] = value.slice(0, 600);
    else if (typeof fallback === "number" && typeof value === "number" && Number.isFinite(value)) (out as Record<string, unknown>)[key] = Math.max(0, Math.min(365, value));
    else if (typeof fallback === "boolean" && typeof value === "boolean") (out as Record<string, unknown>)[key] = value;
  }
  out.imageX = Math.max(0, Math.min(100, Number(source.imageX ?? out.imageX) || 0));
  out.imageY = Math.max(0, Math.min(100, Number(source.imageY ?? out.imageY) || 0));
  out.imageZoom = Math.max(1, Math.min(3, Number(source.imageZoom ?? out.imageZoom) || 1));
  if (!/^#[0-9a-fA-F]{6}$/.test(out.accent)) out.accent = EMAIL_POPUP_DEFAULTS.accent;
  return out;
}
