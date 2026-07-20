import type { OutboundClickRow, SiteEventRow } from "@/lib/analytics";

const EASTERN_TIME_ZONE = "America/New_York";
const MEANINGFUL_EVENTS = new Set([
  "search",
  "search_click",
  "filter_applied",
  "sort_changed",
  "product_click",
  "product_view",
  "add_to_cart",
  "add_to_cart_blocked",
  "share_product",
  "save_product",
]);

function timestamp(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function isSocial(event: SiteEventRow) {
  const landing = `${event.landing_path ?? ""} ${event.path ?? ""}`.toLowerCase();
  const referrer = (event.referrer ?? "").toLowerCase();
  const source = (event.utm_source ?? "").toLowerCase();
  return /fbclid=|igsh=|utm_source=(ig|instagram|facebook|fb)/.test(landing)
    || /instagram\.com|facebook\.com|l\.facebook\.com/.test(referrer)
    || ["ig", "instagram", "facebook", "fb"].includes(source);
}

function isImpossibleDevice(event: SiteEventRow) {
  const width = Number(event.screen_width ?? 0);
  const os = (event.operating_system ?? "").toLowerCase();
  const device = (event.device_type ?? "").toLowerCase();
  const browser = (event.browser ?? "").toLowerCase();

  if ((os === "ios" || os === "android") && width > 1024) return true;
  if (device === "mobile" && width > 900) return true;
  if (browser === "safari" && os === "ios" && device === "desktop") return true;
  return false;
}

type VisitorProfile = {
  id: string;
  pageViews: number;
  meaningfulActions: number;
  sessions: Set<string>;
  firstSeen: number;
  lastSeen: number;
  social: boolean;
  impossibleDevice: boolean;
  linuxChrome: boolean;
};

export type AudienceSummary = {
  recordedVisitors: number;
  likelyHumanVisitors: number;
  socialVisitors: number;
  engagedVisitors: number;
  suspectedAutomatedVisitors: number;
  unqualifiedBounces: number;
  likelyHumanIds: Set<string>;
  socialIds: Set<string>;
  engagedIds: Set<string>;
  suspectedIds: Set<string>;
};

export function analyzeAudience(events: SiteEventRow[], outboundClicks: OutboundClickRow[] = []): AudienceSummary {
  const profiles = new Map<string, VisitorProfile>();

  for (const event of events) {
    const id = event.anonymous_user_id;
    if (!id) continue;
    const at = timestamp(event.created_at);
    const existing = profiles.get(id) ?? {
      id,
      pageViews: 0,
      meaningfulActions: 0,
      sessions: new Set<string>(),
      firstSeen: at,
      lastSeen: at,
      social: false,
      impossibleDevice: false,
      linuxChrome: false,
    };

    if (event.event_type === "page_view") existing.pageViews += 1;
    if (MEANINGFUL_EVENTS.has(event.event_type)) existing.meaningfulActions += 1;
    if (event.session_id) existing.sessions.add(event.session_id);
    existing.firstSeen = Math.min(existing.firstSeen, at);
    existing.lastSeen = Math.max(existing.lastSeen, at);
    existing.social ||= isSocial(event);
    existing.impossibleDevice ||= isImpossibleDevice(event);
    existing.linuxChrome ||= event.browser === "Chrome" && event.operating_system === "Linux";
    profiles.set(id, existing);
  }

  for (const click of outboundClicks) {
    const id = click.anonymous_user_id;
    if (!id) continue;
    const at = timestamp(click.created_at);
    const existing = profiles.get(id) ?? {
      id,
      pageViews: 0,
      meaningfulActions: 0,
      sessions: new Set<string>(),
      firstSeen: at,
      lastSeen: at,
      social: false,
      impossibleDevice: false,
      linuxChrome: false,
    };
    existing.meaningfulActions += 1;
    if (click.session_id) existing.sessions.add(click.session_id);
    existing.firstSeen = Math.min(existing.firstSeen, at);
    existing.lastSeen = Math.max(existing.lastSeen, at);
    existing.social ||= Boolean(click.utm_source) || /instagram|facebook/i.test(click.referrer ?? "");
    profiles.set(id, existing);
  }

  const likelyHumanIds = new Set<string>();
  const socialIds = new Set<string>();
  const engagedIds = new Set<string>();
  const suspectedIds = new Set<string>();
  let unqualifiedBounces = 0;

  for (const profile of profiles.values()) {
    const observedSeconds = Math.max(0, (profile.lastSeen - profile.firstSeen) / 1000);
    const engaged = profile.meaningfulActions > 0 || profile.pageViews >= 2 || profile.sessions.size >= 2 || observedSeconds >= 30;
    const shortPassiveVisit = profile.pageViews <= 1
      && profile.meaningfulActions === 0
      && profile.sessions.size <= 1
      && observedSeconds < 15;
    const suspected = profile.impossibleDevice || (profile.linuxChrome && shortPassiveVisit && !profile.social);
    const likelyHuman = !suspected && (profile.social || !shortPassiveVisit);

    if (profile.social) socialIds.add(profile.id);
    if (engaged) engagedIds.add(profile.id);
    if (suspected) suspectedIds.add(profile.id);
    else if (shortPassiveVisit && !profile.social) unqualifiedBounces += 1;
    if (likelyHuman) likelyHumanIds.add(profile.id);
  }

  return {
    recordedVisitors: profiles.size,
    likelyHumanVisitors: likelyHumanIds.size,
    socialVisitors: socialIds.size,
    engagedVisitors: engagedIds.size,
    suspectedAutomatedVisitors: suspectedIds.size,
    unqualifiedBounces,
    likelyHumanIds,
    socialIds,
    engagedIds,
    suspectedIds,
  };
}

export type IntentProductRow = {
  key: string;
  title: string;
  brand: string;
  clicks: number;
  shoppers: number;
  intentValue: number;
};

export type PurchaseIntentSummary = {
  outboundClicks: number;
  uniqueShoppers: number;
  uniqueSessions: number;
  uniqueProducts: number;
  intentValue: number;
  pricedClicks: number;
  topProducts: IntentProductRow[];
};

export function summarizePurchaseIntent(clicks: OutboundClickRow[]): PurchaseIntentSummary {
  const shoppers = new Set<string>();
  const sessions = new Set<string>();
  const products = new Set<string>();
  const valuedIntentKeys = new Set<string>();
  const rows = new Map<string, { title: string; brand: string; clicks: number; shoppers: Set<string>; intentValue: number }>();
  let intentValue = 0;
  let pricedClicks = 0;

  for (const click of clicks) {
    if (click.anonymous_user_id) shoppers.add(click.anonymous_user_id);
    if (click.session_id) sessions.add(click.session_id);
    const productKey = click.product_slug ?? click.product_id ?? click.destination_url;
    if (productKey) products.add(productKey);

    const row = rows.get(productKey) ?? {
      title: click.product_title ?? click.product_slug ?? "Brand destination",
      brand: click.brand_slug,
      clicks: 0,
      shoppers: new Set<string>(),
      intentValue: 0,
    };
    row.clicks += 1;
    if (click.anonymous_user_id) row.shoppers.add(click.anonymous_user_id);

    const price = Number(click.product_price ?? 0);
    if (price > 0) {
      pricedClicks += 1;
      const intentKey = `${click.session_id ?? click.anonymous_user_id ?? "unknown"}::${productKey}`;
      if (!valuedIntentKeys.has(intentKey)) {
        valuedIntentKeys.add(intentKey);
        intentValue += price;
        row.intentValue += price;
      }
    }
    rows.set(productKey, row);
  }

  return {
    outboundClicks: clicks.length,
    uniqueShoppers: shoppers.size,
    uniqueSessions: sessions.size,
    uniqueProducts: products.size,
    intentValue,
    pricedClicks,
    topProducts: [...rows.entries()]
      .map(([key, row]) => ({ key, title: row.title, brand: row.brand, clicks: row.clicks, shoppers: row.shoppers.size, intentValue: row.intentValue }))
      .sort((a, b) => b.clicks - a.clicks || b.intentValue - a.intentValue)
      .slice(0, 20),
  };
}

export type AnalyticsTrendPoint = {
  key: string;
  label: string;
  visitors: number;
  recordedVisitors: number;
  sessions: number;
  outboundClicks: number;
  intentValue: number;
};

const easternDay = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const easternDayLabel = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_TIME_ZONE,
  month: "short",
  day: "numeric",
});
const easternHourLabel = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_TIME_ZONE,
  hour: "numeric",
});

function dayKey(date: Date) {
  const parts = easternDay.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

export function buildAnalyticsTrend(
  events: SiteEventRow[],
  clicks: OutboundClickRow[],
  days: number,
  likelyHumanIds: Set<string>,
): AnalyticsTrendPoint[] {
  const hourly = days === 1;
  const rows = new Map<string, {
    label: string;
    visitors: Set<string>;
    recordedVisitors: Set<string>;
    sessions: Set<string>;
    outboundClicks: number;
    intentValue: number;
    valuedIntentKeys: Set<string>;
  }>();

  if (hourly) {
    const currentHour = Math.floor(Date.now() / 3_600_000) * 3_600_000;
    for (let offset = 23; offset >= 0; offset -= 1) {
      const at = new Date(currentHour - offset * 3_600_000);
      const key = String(at.getTime());
      rows.set(key, { label: easternHourLabel.format(at), visitors: new Set(), recordedVisitors: new Set(), sessions: new Set(), outboundClicks: 0, intentValue: 0, valuedIntentKeys: new Set() });
    }
  } else {
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const at = new Date(Date.now() - offset * 86_400_000);
      const key = dayKey(at);
      rows.set(key, { label: easternDayLabel.format(at), visitors: new Set(), recordedVisitors: new Set(), sessions: new Set(), outboundClicks: 0, intentValue: 0, valuedIntentKeys: new Set() });
    }
  }

  const eventBucketKey = (createdAt: string) => {
    const at = new Date(createdAt);
    return hourly ? String(Math.floor(at.getTime() / 3_600_000) * 3_600_000) : dayKey(at);
  };

  for (const event of events) {
    if (!event.anonymous_user_id) continue;
    const row = rows.get(eventBucketKey(event.created_at));
    if (!row) continue;
    if (event.event_type === "page_view") {
      row.recordedVisitors.add(event.anonymous_user_id);
      if (likelyHumanIds.has(event.anonymous_user_id)) row.visitors.add(event.anonymous_user_id);
    }
    if (event.session_id && likelyHumanIds.has(event.anonymous_user_id)) row.sessions.add(event.session_id);
  }

  for (const click of clicks) {
    if (!click.anonymous_user_id || !likelyHumanIds.has(click.anonymous_user_id)) continue;
    const row = rows.get(eventBucketKey(click.created_at));
    if (!row) continue;
    row.outboundClicks += 1;
    const price = Number(click.product_price ?? 0);
    const productKey = click.product_slug ?? click.product_id ?? click.destination_url;
    const intentKey = `${click.session_id ?? click.anonymous_user_id}::${productKey}`;
    if (price > 0 && !row.valuedIntentKeys.has(intentKey)) {
      row.valuedIntentKeys.add(intentKey);
      row.intentValue += price;
    }
  }

  return [...rows.entries()].map(([key, row]) => ({
    key,
    label: row.label,
    visitors: row.visitors.size,
    recordedVisitors: row.recordedVisitors.size,
    sessions: row.sessions.size,
    outboundClicks: row.outboundClicks,
    intentValue: row.intentValue,
  }));
}
