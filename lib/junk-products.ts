/**
 * Products that shouldn't be on Street at all: gift cards, shipping/order "protection" add-ons,
 * warranties and similar checkout upsells that brands list as ordinary products. They get skipped
 * at import, so they never show up (and any already on file fall out of the catalog on the next sync).
 *
 * Deliberately narrow: a bare "protection" is NOT enough (UV-protection sunglasses are real products,
 * and "Protect LDN" is a brand). It has to look like a service add-on, a gift card, or a known
 * shipping-protection app.
 */
const GIFT_CARD = /\b(e-?gift|digital gift|gift\s*cards?|gift\s*certificates?|store credit)\b/i;
const SERVICE_ADDON = /\b(shipping|package|parcel|order|delivery|checkout|purchase|return|worry[- ]?free|route|navidium|seel|corso|extend)\b[^a-z0-9]{0,3}(?:\w+\s+){0,2}(protection|insurance|assurance|guarantee|coverage)\b/i;
const SHIPPING_ITEM = /^(?:(?:us|usa|uk|eu|international|return|overnight|express|standard|priority|free|expedited)\s+)*(?:shipping|postage)\b|\bshipping\s+(?:bag|label|box|fee|upgrade)\b/i;
const ADDON_TYPES = /^(subscription|shipping protection|package protection|order protection|insurance|warranty|gift ?cards?|e-?gift cards?|route|add-?ons?|service)$/i;
const ADDON_VENDORS = /^(route|navidium|seel|corso|extend|shipinsure|insurify)\b/i;

export type JunkCheck = { title: string; handle?: string; category?: string; tags?: string[]; vendor?: string };

export function junkProductReason(p: JunkCheck): string | null {
  const title = p.title || "";
  const handle = (p.handle || "").replace(/-/g, " ");
  const type = (p.category || "").trim();
  const tags = (p.tags || []).join(" ");
  if (GIFT_CARD.test(title) || GIFT_CARD.test(handle) || GIFT_CARD.test(type) || /\bgift[-_ ]?card\b/i.test(tags)) return "gift card";
  if (SERVICE_ADDON.test(title) || SERVICE_ADDON.test(handle)) return "protection add-on";
  if (SHIPPING_ITEM.test(title)) return "shipping item";
  if (ADDON_TYPES.test(type)) return `type "${type}"`;
  if (p.vendor && ADDON_VENDORS.test(p.vendor)) return "protection vendor";
  return null;
}

export const isJunkProduct = (p: JunkCheck) => junkProductReason(p) !== null;
